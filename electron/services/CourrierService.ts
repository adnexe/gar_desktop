import { ClientRepository } from '../repositories/ClientRepository';
import { CourrierRepository, type LigneColis } from '../repositories/CourrierRepository';
import { getDb } from '../database/connection';

export interface DemandeCourrier {
    agenceId: number;
    villeArriveeId: number;
    agenceArriveeId: number | null;
    voyageId: number | null;
    voyageUuid?: string | null;
    userId: number;
    agentId: number | null;
    prixExpedition: number;
    expediteur: { nom: string; prenoms?: string | null; telephone: string };
    destinataire: { nom: string; prenoms?: string | null; telephone: string };
    colis: LigneColis[];
    numeroCourrier?: string | null;
    createdAt?: string | null;
}

export class CourrierService {
    private readonly clients = new ClientRepository();
    private readonly courriers = new CourrierRepository();

    preparerNumero(agenceId: number): string | null {
        return this.courriers.prochainNumeroPrepare(agenceId);
    }

    enregistrer(demande: DemandeCourrier) {
        const expediteur = this.clients.trouverOuCreer(demande.expediteur, 'courrier');
        const destinataire = this.clients.trouverOuCreer(demande.destinataire, 'courrier');

        if (!expediteur || !destinataire) {
            throw new Error('EXPEDITEUR_DESTINATAIRE_REQUIS');
        }

        return this.courriers.creer({
            agenceDepartId: demande.agenceId,
            villeArriveeId: demande.villeArriveeId,
            agenceArriveeId: demande.agenceArriveeId,
            voyageId: this.voyageIdLocalParUuid(demande.voyageUuid ?? null) ?? this.voyageIdLocal(demande.voyageId),
            voyageUuid: demande.voyageUuid ?? this.voyageUuidLocal(demande.voyageId),
            expediteurId: expediteur.id,
            destinataireId: destinataire.id,
            userId: demande.userId,
            agentId: demande.agentId,
            prixExpedition: demande.prixExpedition,
            colis: demande.colis,
            numeroCourrier: demande.numeroCourrier,
            createdAt: demande.createdAt,
        });
    }

    private voyageIdLocal(id: number | null): number | null {
        if (!id) return null;

        const ligne = getDb().prepare('SELECT id FROM voyages WHERE id = ? LIMIT 1').get(id) as { id: number } | undefined;

        return ligne?.id ?? null;
    }

    private voyageIdLocalParUuid(uuid: string | null): number | null {
        if (!uuid) return null;

        const ligne = getDb().prepare('SELECT id FROM voyages WHERE uuid = ? LIMIT 1').get(uuid) as { id: number } | undefined;

        return ligne?.id ?? null;
    }

    private voyageUuidLocal(id: number | null): string | null {
        if (!id) return null;

        const ligne = getDb().prepare('SELECT uuid FROM voyages WHERE id = ? LIMIT 1').get(id) as { uuid: string } | undefined;

        return ligne?.uuid ?? null;
    }

    confirmerImpression(uuid: string): boolean {
        return this.courriers.confirmerImpression(uuid);
    }

    annulerImpression(uuid: string, motif: string): boolean {
        return this.courriers.annulerImpression(uuid, motif);
    }

    duJour(agenceId: number, date?: string) {
        return this.courriers.duJour(agenceId, date);
    }

    rapportFinDeCaisse(agenceId: number, date?: string) {
        const rapport = this.courriers.rapportDuJour(agenceId, date);
        return { date: date ?? new Date().toISOString().slice(0, 10), ...rapport };
    }
}
