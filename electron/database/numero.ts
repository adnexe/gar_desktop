import type Database from 'better-sqlite3';

// Numéro humain (ticket/bagage/courrier) : uniquement des chiffres, facile à
// lire/dicter au guichet — contrairement à l'uuid. 9 chiffres (jusqu'à
// ~900 millions de valeurs) : assez large pour ne jamais tourner en boucle,
// on vérifie quand même l'unicité en base avant de l'attribuer.
export function genererNumeroUnique(db: Database.Database, table: string, colonne: string): string {
    const dejaPris = db.prepare(`SELECT 1 FROM ${table} WHERE ${colonne} = ? LIMIT 1`);

    for (let tentative = 0; tentative < 50; tentative++) {
        const numero = String(Math.floor(100_000_000 + Math.random() * 900_000_000));
        if (!dejaPris.get(numero)) {
            return numero;
        }
    }

    throw new Error('Impossible de générer un numéro unique après 50 tentatives.');
}
