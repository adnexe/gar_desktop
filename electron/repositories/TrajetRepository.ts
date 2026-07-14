import { getDb } from '../database/connection';

export interface TrajetRow {
    id: number;
    uuid: string;
    ville_depart_id: number;
    ville_arrivee_id: number;
    nom: string | null;
}

export class TrajetRepository {
    // Un trajet A→B et B→A sont LE MÊME trajet (règle métier partagée avec l'admin).
    resoudreBidirectionnel(villeDepartId: number, villeArriveeId: number): TrajetRow | null {
        const ligne = getDb()
            .prepare(
                `SELECT id, uuid, ville_depart_id, ville_arrivee_id, nom FROM trajets
                 WHERE actif = 1
                   AND ((ville_depart_id = ? AND ville_arrivee_id = ?)
                     OR (ville_depart_id = ? AND ville_arrivee_id = ?))
                 LIMIT 1`,
            )
            .get(villeDepartId, villeArriveeId, villeArriveeId, villeDepartId) as TrajetRow | undefined;

        return ligne ?? null;
    }
}
