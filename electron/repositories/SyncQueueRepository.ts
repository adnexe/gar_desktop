import { getDb } from '../database/connection';

export type OperationSync = 'create' | 'update';

export class SyncQueueRepository {
    empiler(entite: string, entiteUuid: string, operation: OperationSync, payload: unknown): void {
        getDb()
            .prepare(
                `INSERT INTO sync_queue (entite, entite_uuid, operation, payload) VALUES (?, ?, ?, ?)`,
            )
            .run(entite, entiteUuid, operation, JSON.stringify(payload));
    }

    enAttente(limite = 100): Array<{ id: number; entite: string; entite_uuid: string; operation: string; payload: string; tentatives: number }> {
        return getDb()
            .prepare(`SELECT * FROM sync_queue WHERE statut = 'en_attente' ORDER BY id ASC LIMIT ?`)
            .all(limite) as never[];
    }

    marquerSynchronise(id: number): void {
        getDb()
            .prepare(
                `UPDATE sync_queue
                 SET statut = 'synchronise', synced_at = ?, derniere_erreur = NULL
                 WHERE id = ?`,
            )
            .run(new Date().toISOString(), id);
    }

    marquerEchecTemporaire(id: number, erreur: string): void {
        getDb()
            .prepare(
                `UPDATE sync_queue
                 SET tentatives = tentatives + 1, derniere_erreur = ?
                 WHERE id = ?`,
            )
            .run(erreur, id);
    }

    marquerErreurDefinitive(id: number, erreur: string): void {
        getDb()
            .prepare(
                `UPDATE sync_queue
                 SET statut = 'erreur', tentatives = tentatives + 1, derniere_erreur = ?
                 WHERE id = ?`,
            )
            .run(erreur, id);
    }

    compterEnAttente(): number {
        const ligne = getDb().prepare(`SELECT COUNT(*) AS n FROM sync_queue WHERE statut = 'en_attente'`).get() as {
            n: number;
        };
        return ligne.n;
    }
}
