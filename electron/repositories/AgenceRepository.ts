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
    // Une seule agence est synchronisée par appareil Desktop.
    actuelle(): AgenceLocale | null {
        const ligne = getDb()
            .prepare(
                `SELECT a.id, a.uuid, a.reference, a.nom, a.ville_id, v.nom AS ville_nom
                 FROM agences a JOIN villes v ON v.id = a.ville_id
                 LIMIT 1`,
            )
            .get() as AgenceLocale | undefined;

        return ligne ?? null;
    }
}
