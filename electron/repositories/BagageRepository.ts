import { getDb } from '../database/connection';
import { nouvelUuid } from '../database/ids';
import { genererNumeroUnique } from '../database/numero';
import { queueManager } from '../sync/QueueManager';

export interface NouveauBagage {
    agenceId: number;
    ticketId: number | null;
    ticketUuid: string | null;
    ticketNumero: string | null;
    villeArriveeId: number | null;
    voyageId: number | null;
    voyageUuid: string | null;
    userId: number;
    agentId: number | null;
    description: string | null;
    valeur: number | null;
    montant: number;
}

export interface BagageDuJour {
    uuid: string;
    numero_bagage: string;
    heure: string;
    numero_ticket: string | null;
    destination: string | null;
    description: string | null;
    valeur: number | null;
    montant: number;
}

export class BagageRepository {
    duJour(agenceId: number, date?: string): BagageDuJour[] {
        return getDb()
            .prepare(
                `SELECT b.uuid, b.numero_bagage, time(b.created_at) AS heure, COALESCE(t.numero_ticket, b.ticket_numero) AS numero_ticket,
                        va.nom AS destination, b.description, b.valeur, b.montant,
                        (cl.prenoms || ' ' || cl.nom) AS client, cl.telephone AS client_telephone
                 FROM bagages b
                 LEFT JOIN tickets t ON t.id = b.ticket_id
                 LEFT JOIN clients cl ON cl.id = t.client_id
                 LEFT JOIN villes va ON va.id = b.ville_arrivee_id
                 WHERE b.agence_id = ? AND date(b.created_at) = date(?)
                  AND b.statut_paiement = 'paye'
                 ORDER BY b.created_at DESC`,
            )
            .all(agenceId, date ?? 'now') as BagageDuJour[];
    }

    rapportDuJour(agenceId: number, date?: string): {
        destinations: { destination_id: number | null; destination: string; nombre_bagages: number; montant_total: number }[];
        nombre_bagages: number;
        montant_total: number;
    } {
        const db = getDb();
        const ligne = db
            .prepare(
                `SELECT COUNT(*) AS nombre_bagages, COALESCE(SUM(montant), 0) AS montant_total
                 FROM bagages
                 WHERE agence_id = ? AND date(created_at) = date(?) AND statut_paiement = 'paye'`,
            )
            .get(agenceId, date ?? 'now') as { nombre_bagages: number; montant_total: number };

        const destinations = db
            .prepare(
                `SELECT b.ville_arrivee_id AS destination_id,
                        COALESCE(v.nom, 'Non renseignée') AS destination,
                        COUNT(b.id) AS nombre_bagages,
                        COALESCE(SUM(b.montant), 0) AS montant_total
                 FROM bagages b
                 LEFT JOIN villes v ON v.id = b.ville_arrivee_id
                 WHERE b.agence_id = ? AND date(b.created_at) = date(?) AND b.statut_paiement = 'paye'
                 GROUP BY b.ville_arrivee_id, v.nom
                 ORDER BY destination ASC`,
            )
            .all(agenceId, date ?? 'now') as { destination_id: number | null; destination: string; nombre_bagages: number; montant_total: number }[];

        return { ...ligne, destinations };
    }

    creer(donnees: NouveauBagage): { id: number; uuid: string; numero_bagage: string } {
        const db = getDb();
        const uuid = nouvelUuid();
        const numeroBagage = genererNumeroUnique(db, 'bagages', 'numero_bagage');
        const maintenant = new Date().toISOString();

        const info = db
            .prepare(
                `INSERT INTO bagages (uuid, numero_bagage, agence_id, ticket_id, ticket_uuid, ticket_numero, ville_arrivee_id, agence_arrivee_id, voyage_id, voyage_uuid, user_id, agent_id, description, valeur, montant, statut_paiement, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'impression_en_attente', ?, ?)`,
            )
            .run(
                uuid,
                numeroBagage,
                donnees.agenceId,
                donnees.ticketId,
                donnees.ticketUuid,
                donnees.ticketNumero,
                donnees.villeArriveeId,
                null,
                donnees.voyageId,
                donnees.voyageUuid,
                donnees.userId,
                donnees.agentId,
                donnees.description,
                donnees.valeur,
                donnees.montant,
                maintenant,
                maintenant,
            );

        return { id: Number(info.lastInsertRowid), uuid, numero_bagage: numeroBagage };
    }

    confirmerImpression(uuid: string): boolean {
        const db = getDb();
        const maintenant = new Date().toISOString();

        return db.transaction(() => {
            const dejaValide = db
                .prepare(`SELECT 1 FROM bagages WHERE uuid = ? AND statut_paiement = 'paye' LIMIT 1`)
                .get(uuid);

            if (dejaValide) {
                return true;
            }

            const info = db
                .prepare(
                    `UPDATE bagages
                     SET statut_paiement = 'paye',
                         impression_confirmee_at = ?,
                         updated_at = ?
                     WHERE uuid = ? AND statut_paiement = 'impression_en_attente'`,
                )
                .run(maintenant, maintenant, uuid);

            if (info.changes === 0) {
                return false;
            }

            queueManager.ajouter('bagages', uuid, { uuid }, 'create');
            return true;
        })();
    }

    annulerImpression(uuid: string, motif: string): boolean {
        const maintenant = new Date().toISOString();
        const motifCourt = motif.trim().slice(0, 500) || 'Impression non confirmee';

        const info = getDb()
            .prepare(
                `UPDATE bagages
                 SET statut_paiement = 'annule',
                     annule_at = ?,
                     motif_annulation = ?,
                     updated_at = ?
                 WHERE uuid = ? AND statut_paiement = 'impression_en_attente'`,
            )
            .run(maintenant, motifCourt, maintenant, uuid);

        return info.changes > 0;
    }
}
