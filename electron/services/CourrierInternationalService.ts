import { getDb } from '../database/connection';
import { ClientRepository } from '../repositories/ClientRepository';
import {
    CourrierInternationalRepository,
    type LigneColisInternational,
} from '../repositories/CourrierInternationalRepository';

export interface DemandeCourrierInternational {
    agenceId: number;
    paysDestinationId: number | null;
    villeDestinationId: number | null;
    paysDestination: string;
    villeDestination: string;
    adresseDestination?: string | null;
    transporteur?: string | null;
    trackingExterne?: string | null;
    userId: number;
    agentId: number | null;
    modeFacturation: 'par_kilo' | 'par_colis' | 'pourcentage';
    pourcentageFrais?: number | null;
    fraisExpedition: number;
    valeurColis: number;
    observation?: string | null;
    expediteur: { nom: string; prenoms?: string | null; telephone: string };
    destinataire: { nom: string; prenoms?: string | null; telephone: string };
    colis: LigneColisInternational[];
    numeroCourrier?: string | null;
    createdAt?: string | null;
}

export class CourrierInternationalService {
    private readonly clients = new ClientRepository();
    private readonly courriers = new CourrierInternationalRepository();

    preparerNumero(agenceId: number): string | null {
        return this.courriers.prochainNumeroPrepare(agenceId);
    }

    enregistrer(demande: DemandeCourrierInternational) {
        this.verifierDroitCourrierInternational(demande);

        const expediteur = this.clients.trouverOuCreer(demande.expediteur, 'courrier');
        const destinataire = this.clients.trouverOuCreer(demande.destinataire, 'courrier');

        if (!expediteur || !destinataire) {
            throw new Error('EXPEDITEUR_DESTINATAIRE_REQUIS');
        }

        if (!demande.paysDestination.trim() || !demande.villeDestination.trim()) {
            throw new Error('DESTINATION_REQUISE');
        }

        if (!['par_kilo', 'par_colis', 'pourcentage'].includes(demande.modeFacturation)) {
            throw new Error('MODE_FACTURATION_INVALIDE');
        }

        if (!Array.isArray(demande.colis) || demande.colis.length === 0) {
            throw new Error('COLIS_REQUIS');
        }

        const valeurColis = demande.colis.reduce((total, ligne) => total + Number(ligne.quantite) * Number(ligne.prix), 0);
        const montantTotal = Number(demande.fraisExpedition);

        return this.courriers.creer({
            agenceDepartId: demande.agenceId,
            paysDestinationId: demande.paysDestinationId,
            villeDestinationId: demande.villeDestinationId,
            expediteurId: expediteur.id,
            destinataireId: destinataire.id,
            userId: demande.userId,
            agentId: demande.agentId,
            paysDestination: demande.paysDestination,
            villeDestination: demande.villeDestination,
            adresseDestination: demande.adresseDestination ?? null,
            transporteur: demande.transporteur ?? null,
            trackingExterne: demande.trackingExterne ?? null,
            modeFacturation: demande.modeFacturation,
            pourcentageFrais: demande.modeFacturation === 'pourcentage' ? demande.pourcentageFrais ?? null : null,
            fraisExpedition: montantTotal,
            valeurColis,
            montantTotal,
            observation: demande.observation ?? null,
            colis: demande.colis,
            numeroCourrier: demande.numeroCourrier,
            createdAt: demande.createdAt,
        });
    }

    confirmerImpression(uuid: string): boolean {
        return this.courriers.confirmerImpression(uuid);
    }

    annulerImpression(uuid: string, motif: string): boolean {
        return this.courriers.annulerImpression(uuid, motif);
    }

    duJour(agenceId: number, date?: string, userId?: number | null) {
        return this.courriers.duJour(agenceId, date, userId);
    }

    details(uuid: string) {
        return this.courriers.details(uuid);
    }

    rapportFinDeCaisse(agenceId: number, date?: string, userId?: number | null) {
        const rapport = this.courriers.rapportDuJour(agenceId, date, userId);
        return { date: date ?? new Date().toISOString().slice(0, 10), ...rapport };
    }

    private verifierDroitCourrierInternational(demande: DemandeCourrierInternational): void {
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
            throw new Error('COMPTE_NON_AUTORISE_COURRIER_INTERNATIONAL');
        }

        const roleAutorise = ['super_admin', 'admin', 'chef_gare'].includes(utilisateur.role);
        const moduleAutorise = (utilisateur.type_agent ?? '').split(',').filter(Boolean).includes('courrier_international');
        if (!roleAutorise && !moduleAutorise) {
            throw new Error('COMPTE_NON_AUTORISE_COURRIER_INTERNATIONAL');
        }

        if (utilisateur.agent_id !== null) {
            if (utilisateur.agent_id !== demande.agentId || utilisateur.agence_id !== demande.agenceId) {
                throw new Error('COMPTE_NON_AUTORISE_COURRIER_INTERNATIONAL');
            }

            if (
                utilisateur.agent_actif !== 1 ||
                utilisateur.agent_desactive_localement === 1 ||
                utilisateur.agent_supprime_localement === 1 ||
                utilisateur.agence_actif !== 1
            ) {
                throw new Error('COMPTE_NON_AUTORISE_COURRIER_INTERNATIONAL');
            }
        }
    }
}
