import { getDb } from '../database/connection';

export interface Grille {
    ordinaire: { aller: number | null; aller_retour: number | null };
    vip: { aller: number | null; aller_retour: number | null };
}

export class TarifRepository {
    grille(agenceId: number, trajetId: number): Grille {
        const lignes = getDb()
            .prepare(
                `SELECT type_billet, tarification, montant FROM tarifs
                 WHERE agence_id = ? AND trajet_id = ? AND actif = 1`,
            )
            .all(agenceId, trajetId) as { type_billet: string; tarification: string; montant: number }[];

        const grille: Grille = {
            ordinaire: { aller: null, aller_retour: null },
            vip: { aller: null, aller_retour: null },
        };

        for (const ligne of lignes) {
            const tarification = ligne.tarification as 'ordinaire' | 'vip';
            const typeBillet = ligne.type_billet as 'aller' | 'aller_retour';
            grille[tarification][typeBillet] = ligne.montant;
        }

        return grille;
    }

    montant(agenceId: number, trajetId: number, typeBillet: string, tarification: string): number | null {
        const ligne = getDb()
            .prepare(
                `SELECT montant FROM tarifs
                 WHERE agence_id = ? AND trajet_id = ? AND type_billet = ? AND tarification = ? AND actif = 1`,
            )
            .get(agenceId, trajetId, typeBillet, tarification) as { montant: number } | undefined;

        return ligne?.montant ?? null;
    }
}
