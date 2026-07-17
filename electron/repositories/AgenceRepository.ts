import { getDb } from '../database/connection';

export interface AgenceLocale {
    id: number;
    uuid: string;
    reference: string;
    nom: string;
    ville_id: number;
    ville_nom: string;
}

export class AgenceRepository {
    actuelle(): AgenceLocale | null {
        const db = getDb();
        const ligne = db
            .prepare(
                `SELECT a.id, a.uuid, a.reference, a.nom, a.ville_id, v.nom AS ville_nom
                 FROM agences a JOIN villes v ON v.id = a.ville_id
                 WHERE a.reference = (SELECT valeur FROM config WHERE cle = 'agence_reference')
                 LIMIT 1`,
            )
            .get() as AgenceLocale | undefined;

        if (ligne) return ligne;

        const fallback = db
            .prepare(
                `SELECT a.id, a.uuid, a.reference, a.nom, a.ville_id, v.nom AS ville_nom
                 FROM agences a JOIN villes v ON v.id = a.ville_id
                 ORDER BY a.id
                 LIMIT 1`,
            )
            .get() as AgenceLocale | undefined;

        return fallback ?? null;
    }
}
