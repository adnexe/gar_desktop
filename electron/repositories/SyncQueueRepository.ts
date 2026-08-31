import { getDb } from '../database/connection';

export type OperationSync = 'create' | 'update';

export class SyncQueueRepository {
    assurerLotsLocauxDansFile(): number {
        const resultat = getDb()
            .prepare(
                `INSERT INTO sync_queue (entite, entite_uuid, operation, payload)
                 SELECT 'lots_bordereaux', l.uuid, 'create', '{}'
                 FROM lots_bordereaux l
                 WHERE NOT EXISTS (
                     SELECT 1 FROM sync_queue q
                     WHERE q.entite = 'lots_bordereaux' AND q.entite_uuid = l.uuid
                 )`,
            )
            .run();

        return resultat.changes;
    }

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

    annulerEnAttente(entite: string, uuids: string[], motif: string): void {
        const valeurs = uuids.filter(Boolean);
        if (valeurs.length === 0) return;

        const placeholders = valeurs.map(() => '?').join(', ');
        getDb()
            .prepare(
                `UPDATE sync_queue
                 SET statut = 'synchronise', synced_at = ?, derniere_erreur = ?
                 WHERE statut = 'en_attente'
                   AND entite = ?
                   AND entite_uuid IN (${placeholders})`,
            )
            .run(new Date().toISOString(), motif, entite, ...valeurs);
    }

    // Diagnostic : la première ligne encore en attente est celle qui, si elle
    // échoue avec une erreur non « rejouable », bloque tout le reste de la
    // file derrière elle (voir SyncEngine.classerErreur/runCycle).
    premiereErreurEnAttente(): { entite: string; tentatives: number; derniere_erreur: string | null } | null {
        const ligne = getDb()
            .prepare(
                `SELECT entite, tentatives, derniere_erreur
                 FROM sync_queue
                 WHERE statut = 'en_attente' AND tentatives > 0
                 ORDER BY id ASC
                 LIMIT 1`,
            )
            .get() as { entite: string; tentatives: number; derniere_erreur: string | null } | undefined;

        return ligne ?? null;
    }

    // --- Envois définitivement refusés -------------------------------------
    // `marquerErreurDefinitive` sort la ligne de la file (statut 'erreur').
    // Sans les lectures ci-dessous, plus rien ne la mentionne : l'opération est
    // encaissée en caisse mais l'admin ne la verra jamais, et le compteur
    // « en attente » retombe à zéro comme si tout était remonté.

    enErreur(limite = 100): Array<{
        id: number;
        entite: string;
        entite_uuid: string;
        operation: string;
        tentatives: number;
        derniere_erreur: string | null;
        created_at: string;
    }> {
        return getDb()
            .prepare(
                `SELECT id, entite, entite_uuid, operation, tentatives, derniere_erreur, created_at
                 FROM sync_queue
                 WHERE statut = 'erreur'
                 ORDER BY id ASC
                 LIMIT ?`,
            )
            .all(limite) as never[];
    }

    compterEnErreur(): number {
        const ligne = getDb().prepare(`SELECT COUNT(*) AS n FROM sync_queue WHERE statut = 'erreur'`).get() as {
            n: number;
        };
        return ligne.n;
    }

    /**
     * Remet un envoi refusé dans la file. Le compteur de tentatives repart à
     * zéro : le refus venait presque toujours d'un état serveur corrigé depuis
     * (numéro libéré, agence recréée, voyage remonté), la nouvelle tentative
     * mérite donc le même crédit qu'une vente neuve. Sans `id`, toute la liste
     * repart.
     */
    reprogrammer(id?: number): number {
        const resultat =
            typeof id === 'number'
                ? getDb()
                      .prepare(
                          `UPDATE sync_queue
                           SET statut = 'en_attente', tentatives = 0, derniere_erreur = NULL
                           WHERE id = ? AND statut = 'erreur'`,
                      )
                      .run(id)
                : getDb()
                      .prepare(
                          `UPDATE sync_queue
                           SET statut = 'en_attente', tentatives = 0, derniere_erreur = NULL
                           WHERE statut = 'erreur'`,
                      )
                      .run();

        return resultat.changes;
    }

    compterEnAttente(): number {
        const ligne = getDb().prepare(`SELECT COUNT(*) AS n FROM sync_queue WHERE statut = 'en_attente'`).get() as {
            n: number;
        };
        return ligne.n;
    }
}
