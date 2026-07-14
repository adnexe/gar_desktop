import { getDb } from '../database/connection';

export class ConfigRepository {
    obtenir(cle: string): string | null {
        const ligne = getDb().prepare('SELECT valeur FROM config WHERE cle = ?').get(cle) as
            | { valeur: string }
            | undefined;

        return ligne?.valeur ?? null;
    }

    definir(cle: string, valeur: string): void {
        getDb()
            .prepare('INSERT INTO config (cle, valeur) VALUES (?, ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur')
            .run(cle, valeur);
    }

    supprimer(cle: string): void {
        getDb().prepare('DELETE FROM config WHERE cle = ?').run(cle);
    }

    estConfiguree(): boolean {
        return this.obtenir('agence_reference') !== null;
    }
}
