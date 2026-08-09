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
    // Le `nom` stocké en base est figé au sens de la création : pour une
    // agence B qui vend vers A, l'afficher tel quel montrerait "A - B" au
    // lieu de "B - A". On reconstruit donc le nom à partir des villes
    // réellement demandées (villeDepartId = toujours la ville de l'agence),
    // jamais depuis la colonne `nom` du trajet.
    resoudreBidirectionnel(villeDepartId: number, villeArriveeId: number): TrajetRow | null {
        const ligne = getDb()
            .prepare(
                `SELECT t.id, t.uuid, t.ville_depart_id, t.ville_arrivee_id,
                        vd.nom AS ville_depart_nom, va.nom AS ville_arrivee_nom
                 FROM trajets t
                 JOIN villes vd ON vd.id = ?
                 JOIN villes va ON va.id = ?
                 WHERE t.actif = 1
                   AND ((t.ville_depart_id = ? AND t.ville_arrivee_id = ?)
                     OR (t.ville_depart_id = ? AND t.ville_arrivee_id = ?))
                 LIMIT 1`,
            )
            .get(
                villeDepartId,
                villeArriveeId,
                villeDepartId,
                villeArriveeId,
                villeArriveeId,
                villeDepartId,
            ) as (Omit<TrajetRow, 'nom'> & { ville_depart_nom: string; ville_arrivee_nom: string }) | undefined;

        if (!ligne) return null;

        return {
            id: ligne.id,
            uuid: ligne.uuid,
            ville_depart_id: ligne.ville_depart_id,
            ville_arrivee_id: ligne.ville_arrivee_id,
            nom: `${ligne.ville_depart_nom} - ${ligne.ville_arrivee_nom}`,
        };
    }
}
