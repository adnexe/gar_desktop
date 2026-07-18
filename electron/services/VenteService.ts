import { ClientRepository, type InfosClient } from '../repositories/ClientRepository';
import { CompagnieRepository } from '../repositories/CompagnieRepository';
import { TarifRepository } from '../repositories/TarifRepository';
import { TicketRepository } from '../repositories/TicketRepository';
import { TrajetRepository } from '../repositories/TrajetRepository';
import { VoyageRepository } from '../repositories/VoyageRepository';
import { formatDate, formatDateHeure } from '../database/dates';
import { getDb } from '../database/connection';

export interface RechercheVoyages {
    agenceId: number;
    villeDepartId: number;
    villeArriveeId: number;
}

export interface DemandeVente {
    agenceId: number;
    voyageId: number;
    trajetId: number;
    agentId: number | null;
    userId: number;
    typeBillet: 'aller' | 'aller_retour';
    tarification: 'ordinaire' | 'vip';
    numeroPlace: number;
    timbre: number;
    client: InfosClient;
    numeroTicket?: string | null;
    createdAt?: string | null;
}

export class VenteService {
    private readonly trajets = new TrajetRepository();
    private readonly tarifs = new TarifRepository();
    private readonly voyages = new VoyageRepository();
    private readonly tickets = new TicketRepository();
    private readonly clients = new ClientRepository();
    private readonly compagnie = new CompagnieRepository();

    // Résolution bidirectionnelle A→B / B→A + grille tarifaire + voyages
    // disponibles pour ce trajet précis (le frontend renvoie ensuite
    // trajet.id tel quel dans DemandeVente.trajetId).
    rechercherVoyages({ agenceId, villeDepartId, villeArriveeId }: RechercheVoyages) {
        const trajet = this.trajets.resoudreBidirectionnel(villeDepartId, villeArriveeId);
        if (!trajet) {
            return { trajet: null, tarif: null, voyages: [] };
        }

        const voyages = this.voyages.disponiblesPourTrajet(agenceId, trajet.id).map((v) => ({
            id: v.id,
            uuid: v.uuid,
            date_depart: v.date_depart,
            heure_depart: v.heure_depart,
            numero_depart: v.numero_depart,
            itineraire: v.itineraire_nom,
            vehicule_immatriculation: v.vehicule_immatriculation,
            nombre_places: v.nombre_places,
            chauffeur: v.chauffeur_nom,
            places_occupees: v.places_occupees,
            premiere_place_libre: v.premiere_place_libre,
        }));

        return {
            trajet,
            tarif: this.tarifs.grille(agenceId, trajet.id),
            voyages,
            message: voyages.length === 0 ? "Aucun voyage programmé à partir d'aujourd'hui pour cette destination." : null,
        };
    }

    rechercherClient(telephone: string) {
        return this.clients.parTelephone(telephone);
    }

    exporterClientPourClient(telephone: string) {
        return this.clients.exporterParTelephone(telephone);
    }

    exporterTicketPourClient(code: string) {
        return this.tickets.exporterUnPourClient(code);
    }

    exporterTicketsPourClient(agenceId: number, date?: string | null) {
        return this.tickets.exporterPourClient(agenceId, date);
    }

    preparerNumero(): string | null {
        return this.tickets.prochainNumeroPrepare();
    }

    // Le prix n'est JAMAIS accepté depuis le frontend : il est toujours
    // recalculé ici à partir de agenceId + trajetId + typeBillet + tarification.
    vendre(demande: DemandeVente) {
        this.verifierDroitVenteTicket(demande);

        const montant = this.tarifs.montant(demande.agenceId, demande.trajetId, demande.typeBillet, demande.tarification);
        if (montant === null) {
            throw new Error('TARIF_NON_CONFIGURE');
        }

        const client = this.clients.trouverOuCreer(demande.client);

        const ticket = this.tickets.creer({
            voyageId: demande.voyageId,
            agentId: demande.agentId,
            userId: demande.userId,
            clientId: client?.id ?? null,
            trajetId: demande.trajetId,
            typeBillet: demande.typeBillet,
            numeroPlace: demande.numeroPlace,
            montant,
            timbre: demande.timbre,
            tarification: demande.tarification,
            numeroTicket: demande.numeroTicket,
            createdAt: demande.createdAt,
        });

        const d = this.tickets.avecDetails(ticket.id) as {
            uuid: string;
            numero_ticket: string;
            numero_place: number;
            montant: number;
            timbre: number;
            total: number;
            tarification: string;
            type_billet: string;
            created_at: string;
            trajet_nom: string;
            ville_depart_nom: string;
            ville_arrivee_nom: string;
            voyage_date: string;
            voyage_heure: string;
            vehicule_immatriculation: string;
            agence_nom: string;
            vendeur_nom: string | null;
            vendeur_number: string;
            client_nom: string | null;
        };

        return {
            uuid: d.uuid,
            numero: d.numero_ticket,
            numero_place: d.numero_place,
            type_billet: d.type_billet,
            tarification: d.tarification,
            montant: d.montant,
            timbre: d.timbre,
            total: d.total,
            created_at: formatDateHeure(d.created_at),
            agence: d.agence_nom,
            ville_depart: d.ville_depart_nom,
            ville_arrivee: d.ville_arrivee_nom,
            date_depart: formatDate(d.voyage_date),
            heure_depart: d.voyage_heure,
            vehicule: d.vehicule_immatriculation,
            client: client ? [client.prenoms, client.nom].filter(Boolean).join(' ') || client.telephone : null,
            vendeur: d.vendeur_nom ?? d.vendeur_number,
            compagnie: this.compagnie.actuelle(),
        };
    }

    private verifierDroitVenteTicket(demande: DemandeVente): void {
        const utilisateur = getDb()
            .prepare(
                `SELECT u.id, u.role, u.agent_id,
                        ag.agence_id, ag.type_agent, ag.actif AS agent_actif,
                        COALESCE(ag.desactive_localement, 0) AS agent_desactive_localement,
                        COALESCE(ag.supprime_localement, 0) AS agent_supprime_localement,
                        agence.actif AS agence_actif
                 FROM users u
                 LEFT JOIN agents ag ON ag.id = u.agent_id
                 LEFT JOIN agences agence ON agence.id = ag.agence_id
                 WHERE u.id = ?
                   AND u.actif = 1
                   AND COALESCE(u.desactive_localement, 0) = 0
                   AND COALESCE(u.supprime_localement, 0) = 0
                 LIMIT 1`,
            )
            .get(demande.userId) as
            | {
                  id: number;
                  role: string;
                  agent_id: number | null;
                  agence_id: number | null;
                  type_agent: string | null;
                  agent_actif: number | null;
                  agent_desactive_localement: number | null;
                  agent_supprime_localement: number | null;
                  agence_actif: number | null;
              }
            | undefined;

        if (!utilisateur) {
            throw new Error('COMPTE_NON_AUTORISE_TICKET');
        }

        const roleAutorise = ['super_admin', 'admin', 'chef_gare'].includes(utilisateur.role);
        const modules = (utilisateur.type_agent ?? '').split(',').filter(Boolean);
        const moduleAutorise = modules.includes('ticket');
        if (!roleAutorise && !moduleAutorise) {
            throw new Error('COMPTE_NON_AUTORISE_TICKET');
        }

        if (utilisateur.agent_id !== null) {
            if (utilisateur.agent_id !== demande.agentId || utilisateur.agence_id !== demande.agenceId) {
                throw new Error('COMPTE_NON_AUTORISE_TICKET');
            }

            if (
                utilisateur.agent_actif !== 1 ||
                utilisateur.agent_desactive_localement === 1 ||
                utilisateur.agent_supprime_localement === 1 ||
                utilisateur.agence_actif !== 1
            ) {
                throw new Error('COMPTE_NON_AUTORISE_TICKET');
            }
        }
    }

    confirmerImpression(uuid: string): boolean {
        return this.tickets.confirmerImpression(uuid);
    }

    annulerImpression(uuid: string, motif: string): boolean {
        return this.tickets.annulerImpression(uuid, motif);
    }

    ventesDuJour(agenceId: number, date?: string, userId?: number | null) {
        return this.tickets.ventesDuJour(agenceId, date, userId);
    }

    rapportFinDeCaisse(agenceId: number, date?: string, userId?: number | null, voyageId?: number | null) {
        const lignes = this.tickets.rapportParVoyage(agenceId, date, userId, voyageId);

        return {
            date: date ?? new Date().toISOString().slice(0, 10),
            voyages: lignes,
            nombre_tickets_total: lignes.reduce((s, l) => s + l.nombre_tickets, 0),
            montant_total: lignes.reduce((s, l) => s + l.montant_total, 0),
        };
    }

    voyagesFinDeCaisse(agenceId: number, date?: string, userId?: number | null) {
        return this.tickets.voyagesAvecVentes(agenceId, date, userId);
    }
}
