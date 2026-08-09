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
        this.verifierDroitCourrier(demande);

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

    private verifierDroitCourrier(demande: DemandeCourrier): void {
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
            throw new Error('COMPTE_NON_AUTORISE_COURRIER');
        }

        const roleAutorise = ['super_admin', 'admin', 'chef_gare'].includes(utilisateur.role);
        const moduleAutorise = (utilisateur.type_agent ?? '').split(',').filter(Boolean).includes('courrier');
        if (!roleAutorise && !moduleAutorise) {
            throw new Error('COMPTE_NON_AUTORISE_COURRIER');
        }

        if (utilisateur.agent_id !== null) {
            if (utilisateur.agent_id !== demande.agentId || utilisateur.agence_id !== demande.agenceId) {
                throw new Error('COMPTE_NON_AUTORISE_COURRIER');
            }

            if (
                utilisateur.agent_actif !== 1 ||
                utilisateur.agent_desactive_localement === 1 ||
                utilisateur.agent_supprime_localement === 1 ||
                utilisateur.agence_actif !== 1
            ) {
                throw new Error('COMPTE_NON_AUTORISE_COURRIER');
            }
        }
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

    duJour(agenceId: number, date?: string, userId?: number | null) {
        return this.courriers.duJour(agenceId, date, userId);
    }

    details(uuid: string) {
        return this.courriers.details(uuid);
    }

    rapportFinDeCaisse(agenceId: number, date?: string, voyageId?: number | null, userId?: number | null) {
        const rapport = this.courriers.rapportDuJour(agenceId, date, voyageId, userId);
        return { date: date ?? new Date().toISOString().slice(0, 10), ...rapport };
    }
}
