import { BagageRepository } from '../repositories/BagageRepository';
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

    rechercherTicket(code: string) {
        return this.tickets.parNumeroCourt(code);
    }

    preparerNumero(agenceId: number): string | null {
        return this.bagages.prochainNumeroPrepare(agenceId);
    }

    // Le ticket est facultatif : un bagage peut être enregistré seul (avec
    // juste une destination et un voyage), sans passager associé.
    enregistrer(demande: DemandeBagage) {
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

        const bagage = this.bagages.creer({
            agenceId: demande.agenceId,
            ticketId,
            ticketUuid,
            ticketNumero,
            villeArriveeId,
            voyageId,
            voyageUuid,
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

    duJour(agenceId: number, date?: string) {
        return this.bagages.duJour(agenceId, date);
    }

    rapportFinDeCaisse(agenceId: number, date?: string) {
        const rapport = this.bagages.rapportDuJour(agenceId, date);
        return { date: date ?? new Date().toISOString().slice(0, 10), ...rapport };
    }
}
