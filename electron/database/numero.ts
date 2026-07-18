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

function normaliserCodePoste(codePoste?: string | null): string | null {
    const code = (codePoste ?? '').trim();
    if (!/^\d{1,3}$/.test(code)) return null;

    return code.padStart(3, '0');
}

function normaliserCodeAgence(codeAgence?: string | null): string | null {
    const code = (codeAgence ?? '').trim().toUpperCase();
    if (!/^[A-Z0-9]{3}$/.test(code)) return null;

    return code;
}

function lireCompteurOperation(db: Database.Database, table: string, colonne: string, sequence: string, prefixe: string): number {
    const cle = `${sequence}_${prefixe}`;
    const ligneConfig = db.prepare('SELECT valeur FROM config WHERE cle = ?').get(cle) as { valeur: string } | undefined;
    const compteurConfig = Number.parseInt(ligneConfig?.valeur ?? '0', 10);
    const ligneMax = db
        .prepare(
            `SELECT MAX(CAST(substr(${colonne}, ?) AS INTEGER)) AS max
             FROM ${table}
             WHERE substr(${colonne}, 1, ?) = ?
               AND ${colonne} GLOB ?`,
        )
        .get(prefixe.length + 1, prefixe.length, prefixe, `${prefixe}[0-9][0-9][0-9][0-9][0-9][0-9]`) as { max: number | null } | undefined;

    return Math.max(
        Number.isFinite(compteurConfig) ? compteurConfig : 0,
        Number(ligneMax?.max ?? 0),
    );
}

function enregistrerCompteurOperation(db: Database.Database, sequence: string, prefixe: string, compteur: number): void {
    db.prepare('INSERT INTO config (cle, valeur) VALUES (?, ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur')
        .run(`${sequence}_${prefixe}`, String(compteur));
}

function prefixeOperation(codePoste?: string | null, codeAgence?: string | null): string | null {
    const poste = normaliserCodePoste(codePoste);
    if (!poste) {
        return null;
    }

    const agence = normaliserCodeAgence(codeAgence);
    return agence ? `${agence}${poste}` : poste;
}

function prevoirNumeroPrefixe(
    db: Database.Database,
    table: string,
    colonne: string,
    sequence: string,
    codePoste?: string | null,
    codeAgence?: string | null,
): string | null {
    const prefixe = prefixeOperation(codePoste, codeAgence);
    if (!prefixe) return null;

    const compteur = lireCompteurOperation(db, table, colonne, sequence, prefixe) + 1;
    if (compteur > 999_999) {
        throw new Error(`Compteur épuisé pour le préfixe ${prefixe}.`);
    }

    return `${prefixe}${String(compteur).padStart(6, '0')}`;
}

function utiliserNumeroPrepare(
    db: Database.Database,
    table: string,
    colonne: string,
    sequence: string,
    codePoste?: string | null,
    codeAgence?: string | null,
    numeroPrepare?: string | null,
): string | null {
    const prefixe = prefixeOperation(codePoste, codeAgence);
    const numero = (numeroPrepare ?? '').trim().toUpperCase();
    if (!prefixe || !new RegExp(`^${prefixe}\\d{6}$`).test(numero)) {
        return null;
    }

    const dejaPris = db.prepare(`SELECT 1 FROM ${table} WHERE ${colonne} = ? LIMIT 1`).get(numero);
    if (dejaPris) {
        return null;
    }

    enregistrerCompteurOperation(db, sequence, prefixe, Number.parseInt(numero.slice(prefixe.length), 10));
    return numero;
}

function utiliserNumeroPrepareExterne(db: Database.Database, table: string, colonne: string, numeroPrepare?: string | null): string | null {
    const numero = (numeroPrepare ?? '').trim().toUpperCase();
    if (!/^(?:[A-Z0-9]{3}\d{9}|\d{9})$/.test(numero)) {
        return null;
    }

    const dejaPris = db.prepare(`SELECT 1 FROM ${table} WHERE ${colonne} = ? LIMIT 1`).get(numero);
    return dejaPris ? null : numero;
}

function genererNumeroPrefixe(
    db: Database.Database,
    table: string,
    colonne: string,
    sequence: string,
    codePoste?: string | null,
    codeAgence?: string | null,
): string | null {
    const prefixe = prefixeOperation(codePoste, codeAgence);
    if (!prefixe) return null;

    const dejaPris = db.prepare(`SELECT 1 FROM ${table} WHERE ${colonne} = ? LIMIT 1`);
    let compteur = lireCompteurOperation(db, table, colonne, sequence, prefixe);

    for (let tentative = 0; tentative < 1000; tentative++) {
        compteur++;

        if (compteur > 999_999) {
            throw new Error(`Compteur épuisé pour le préfixe ${prefixe}.`);
        }

        const numero = `${prefixe}${String(compteur).padStart(6, '0')}`;
        if (!dejaPris.get(numero)) {
            enregistrerCompteurOperation(db, sequence, prefixe, compteur);
            return numero;
        }
    }

    throw new Error(`Impossible de générer un numéro unique pour ${sequence} après 1000 tentatives.`);
}

// Numéro visible des opérations. Avec une licence récente, les 3 premiers
// caractères identifient l'agence, les 3 suivants le poste, et les 6 derniers
// sont un compteur local : YOP001000001, YOP001000002...
export function prevoirNumeroTicket(db: Database.Database, codePoste?: string | null, codeAgence?: string | null): string | null {
    return prevoirNumeroPrefixe(db, 'tickets', 'numero_ticket', 'ticket_sequence', codePoste, codeAgence);
}

export function prevoirNumeroBagage(db: Database.Database, codePoste?: string | null, codeAgence?: string | null): string | null {
    return prevoirNumeroPrefixe(db, 'bagages', 'numero_bagage', 'bagage_sequence', codePoste, codeAgence);
}

export function prevoirNumeroCourrier(db: Database.Database, codePoste?: string | null, codeAgence?: string | null): string | null {
    return prevoirNumeroPrefixe(db, 'courriers', 'numero_courrier', 'courrier_sequence', codePoste, codeAgence);
}

export function genererNumeroTicket(db: Database.Database, codePoste?: string | null, codeAgence?: string | null, numeroPrepare?: string | null): string {
    return utiliserNumeroPrepare(db, 'tickets', 'numero_ticket', 'ticket_sequence', codePoste, codeAgence, numeroPrepare)
        ?? utiliserNumeroPrepareExterne(db, 'tickets', 'numero_ticket', numeroPrepare)
        ?? genererNumeroPrefixe(db, 'tickets', 'numero_ticket', 'ticket_sequence', codePoste, codeAgence)
        ?? genererNumeroUnique(db, 'tickets', 'numero_ticket');
}

export function marquerNumeroTicketUtilise(db: Database.Database, codePoste?: string | null, codeAgence?: string | null, numero?: string | null): boolean {
    return utiliserNumeroPrepare(db, 'tickets', 'numero_ticket', 'ticket_sequence', codePoste, codeAgence, numero) !== null;
}

export function genererNumeroBagage(db: Database.Database, codePoste?: string | null, codeAgence?: string | null, numeroPrepare?: string | null): string {
    return utiliserNumeroPrepare(db, 'bagages', 'numero_bagage', 'bagage_sequence', codePoste, codeAgence, numeroPrepare)
        ?? genererNumeroPrefixe(db, 'bagages', 'numero_bagage', 'bagage_sequence', codePoste, codeAgence)
        ?? genererNumeroUnique(db, 'bagages', 'numero_bagage');
}

export function genererNumeroCourrier(db: Database.Database, codePoste?: string | null, codeAgence?: string | null, numeroPrepare?: string | null): string {
    return utiliserNumeroPrepare(db, 'courriers', 'numero_courrier', 'courrier_sequence', codePoste, codeAgence, numeroPrepare)
        ?? genererNumeroPrefixe(db, 'courriers', 'numero_courrier', 'courrier_sequence', codePoste, codeAgence)
        ?? genererNumeroUnique(db, 'courriers', 'numero_courrier');
}
