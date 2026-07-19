import { BagageRepository } from '../repositories/BagageRepository';
import { ClientRepository } from '../repositories/ClientRepository';
import { TicketRepository } from '../repositories/TicketRepository';
import { getDb } from '../database/connection';

export interface DemandeBagage {
    agenceId: number;
    code: string | null;
    ticketUuid?: string | null;
    ticketNumero?: string | null;
    villeArriveeId: number | null;
    voyageId: number | null;
    voyageUuid?: string | null;
    client?: { nom?: string | null; prenoms?: string | null; telephone?: string | null } | null;
    userId: number;
    agentId: number | null;
    description: string | null;
    valeur: number | null;
    montant: number;
    numeroBagage?: string | null;
    createdAt?: string | null;
}

export class BagageService {
    private readonly tickets = new TicketRepository();
    private readonly bagages = new BagageRepository();
    private readonly clients = new ClientRepository();

    rechercherTicket(code: string) {
        return this.tickets.parNumeroCourt(code);
    }

    preparerNumero(agenceId: number): string | null {
        return this.bagages.prochainNumeroPrepare(agenceId);
    }

    // Le ticket est facultatif : un bagage peut être enregistré seul (avec
    // juste une destination et un voyage), sans passager associé.
    enregistrer(demande: DemandeBagage) {
        this.verifierDroitBagage(demande);

        let ticketId: number | null = null;
        let villeArriveeId = demande.villeArriveeId;
        let voyageId: number | null = null;
        let ticketUuid = demande.ticketUuid ?? null;
        let ticketNumero = demande.ticketNumero ?? null;
        let voyageUuid = demande.voyageUuid ?? null;

        if (demande.code && demande.code.trim()) {
            const ticket = this.tickets.parNumeroCourt(demande.code);
            if (!ticket && !ticketUuid) {
                throw new Error('TICKET_INTROUVABLE');
            }

            if (ticket) {
                ticketId = ticket.id;
                ticketUuid = ticket.uuid;
                ticketNumero = ticket.numero_ticket;
                villeArriveeId ??= ticket.ville_arrivee_id;
                voyageId = ticket.voyage_id;
                voyageUuid = ticket.voyage_uuid;
            } else if (voyageUuid) {
                voyageId = this.voyageIdLocalParUuid(voyageUuid);
            }
        }

        if (!voyageId) {
            voyageId = voyageUuid ? this.voyageIdLocalParUuid(voyageUuid) : this.voyageIdLocal(demande.voyageId);
        }

        if (!voyageUuid) {
            voyageUuid = this.voyageUuidLocal(voyageId ?? demande.voyageId);
        }

        // Client saisi au comptoir (facultatif) : réutilisé ou créé par
        // téléphone, comme pour les courriers. Le client du ticket reste
        // prioritaire à l'affichage.
        const client = demande.client && (demande.client.nom || demande.client.prenoms || demande.client.telephone)
            ? this.clients.trouverOuCreer(demande.client, 'bagage')
            : null;

        const bagage = this.bagages.creer({
            agenceId: demande.agenceId,
            ticketId,
            ticketUuid,
            ticketNumero,
            villeArriveeId,
            voyageId,
            voyageUuid,
            clientId: client?.id ?? null,
            userId: demande.userId,
            agentId: demande.agentId,
            description: demande.description,
            valeur: demande.valeur,
            montant: demande.montant,
            numeroBagage: demande.numeroBagage,
            createdAt: demande.createdAt,
        });

        return bagage;
    }

    private verifierDroitBagage(demande: DemandeBagage): void {
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
            throw new Error('COMPTE_NON_AUTORISE_BAGAGE');
        }

        const roleAutorise = ['super_admin', 'admin', 'chef_gare'].includes(utilisateur.role);
        const moduleAutorise = (utilisateur.type_agent ?? '').split(',').filter(Boolean).includes('bagage');
        if (!roleAutorise && !moduleAutorise) {
            throw new Error('COMPTE_NON_AUTORISE_BAGAGE');
        }

        if (utilisateur.agent_id !== null) {
            if (utilisateur.agent_id !== demande.agentId || utilisateur.agence_id !== demande.agenceId) {
                throw new Error('COMPTE_NON_AUTORISE_BAGAGE');
            }

            if (
                utilisateur.agent_actif !== 1 ||
                utilisateur.agent_desactive_localement === 1 ||
                utilisateur.agent_supprime_localement === 1 ||
                utilisateur.agence_actif !== 1
            ) {
                throw new Error('COMPTE_NON_AUTORISE_BAGAGE');
            }
        }
    }

    private voyageIdLocal(id: number | null): number | null {
        if (!id) return null;

        const ligne = getDb().prepare('SELECT id FROM voyages WHERE id = ? LIMIT 1').get(id) as { id: number } | undefined;

        return ligne?.id ?? null;
    }

    private voyageIdLocalParUuid(uuid: string): number | null {
        const ligne = getDb().prepare('SELECT id FROM voyages WHERE uuid = ? LIMIT 1').get(uuid) as { id: number } | undefined;

        return ligne?.id ?? null;
    }

    private voyageUuidLocal(id: number | null | undefined): string | null {
        if (!id) return null;

        const ligne = getDb().prepare('SELECT uuid FROM voyages WHERE id = ? LIMIT 1').get(id) as { uuid: string } | undefined;

        return ligne?.uuid ?? null;
    }

    confirmerImpression(uuid: string): boolean {
        return this.bagages.confirmerImpression(uuid);
    }

    annulerImpression(uuid: string, motif: string): boolean {
        return this.bagages.annulerImpression(uuid, motif);
    }

    duJour(agenceId: number, date?: string, userId?: number | null) {
        return this.bagages.duJour(agenceId, date, userId);
    }

    details(uuid: string) {
        return this.bagages.details(uuid);
    }

    rapportFinDeCaisse(agenceId: number, date?: string, voyageId?: number | null, userId?: number | null) {
        const rapport = this.bagages.rapportDuJour(agenceId, date, voyageId, userId);
        return { date: date ?? new Date().toISOString().slice(0, 10), ...rapport };
    }
}
