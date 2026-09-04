import type Database from 'better-sqlite3';

export type CategorieCompteurOperation =
    | 'ticket'
    | 'bagage'
    | 'courrier'
    | 'courrier_international'
    | 'lot_courrier'
    | 'lot_bagage'
    | 'lot_courrier_international'
    | 'convoi';

export type CompteursOperationsServeur = {
    prefixe: string | null;
} & Record<CategorieCompteurOperation, number>;

type DefinitionCompteur = {
    table: string;
    colonne: string;
    sequence: string;
    prefixe: (base: string) => string;
};

const DEFINITIONS_COMPTEURS: Record<CategorieCompteurOperation, DefinitionCompteur> = {
    ticket: { table: 'tickets', colonne: 'numero_ticket', sequence: 'ticket_sequence', prefixe: (base) => base },
    bagage: { table: 'bagages', colonne: 'numero_bagage', sequence: 'bagage_sequence', prefixe: (base) => base },
    courrier: { table: 'courriers', colonne: 'numero_courrier', sequence: 'courrier_sequence', prefixe: (base) => base },
    courrier_international: { table: 'courriers_internationaux', colonne: 'numero_courrier', sequence: 'courrier_international_sequence', prefixe: (base) => base },
    lot_courrier: { table: 'lots_bordereaux', colonne: 'reference', sequence: 'lot_courrier_sequence', prefixe: (base) => `BE-${base}` },
    lot_bagage: { table: 'lots_bordereaux', colonne: 'reference', sequence: 'lot_bagage_sequence', prefixe: (base) => `BB-${base}` },
    lot_courrier_international: { table: 'lots_bordereaux', colonne: 'reference', sequence: 'lot_courrier_international_sequence', prefixe: (base) => `BI-${base}` },
    convoi: { table: 'convois', colonne: 'reference', sequence: 'convoi_sequence', prefixe: (base) => `CNV-${base}` },
};

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
    const cle = `${sequence}_${prefixe}`;
    const ligne = db.prepare('SELECT valeur FROM config WHERE cle = ?').get(cle) as { valeur: string } | undefined;
    const precedent = Number.parseInt(ligne?.valeur ?? '0', 10);
    const monotone = Math.max(Number.isFinite(precedent) ? precedent : 0, compteur);
    db.prepare('INSERT INTO config (cle, valeur) VALUES (?, ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur')
        .run(cle, String(monotone));
}

export function prefixeOperation(codePoste?: string | null, codeAgence?: string | null): string | null {
    const poste = normaliserCodePoste(codePoste);
    if (!poste) {
        return null;
    }

    const agence = normaliserCodeAgence(codeAgence);
    return agence ? `${agence}${poste}` : poste;
}

function exigerPrefixeOperation(codePoste?: string | null, codeAgence?: string | null): string {
    const prefixe = prefixeOperation(codePoste, codeAgence);
    if (!prefixe || prefixe.length !== 6) {
        throw new Error('NUMEROTATION_POSTE_NON_CONFIGUREE');
    }

    return prefixe;
}

function genererAvecPrefixe(
    db: Database.Database,
    table: string,
    colonne: string,
    sequence: string,
    prefixe: string,
): string {
    const dejaPris = db.prepare(`SELECT 1 FROM ${table} WHERE ${colonne} = ? LIMIT 1`);
    let compteur = lireCompteurOperation(db, table, colonne, sequence, prefixe);

    for (let tentative = 0; tentative < 1000; tentative++) {
        compteur++;
        if (compteur > 999_999) throw new Error(`Compteur épuisé pour le préfixe ${prefixe}.`);

        const numero = `${prefixe}${String(compteur).padStart(6, '0')}`;
        if (!dejaPris.get(numero)) {
            enregistrerCompteurOperation(db, sequence, prefixe, compteur);
            return numero;
        }
    }

    throw new Error(`Impossible de générer un numéro unique pour ${sequence} après 1000 tentatives.`);
}

/**
 * Pose un plancher monotone reçu de l'admin. Un compteur local plus avancé
 * n'est jamais diminué, ce qui protège aussi les opérations encore hors ligne.
 */
export function appliquerCompteursOperationsServeur(
    db: Database.Database,
    compteurs: CompteursOperationsServeur,
    codePoste?: string | null,
    codeAgence?: string | null,
): Record<CategorieCompteurOperation, number> {
    const base = exigerPrefixeOperation(codePoste, codeAgence);
    if (compteurs.prefixe !== base) throw new Error('COMPTEURS_PREFIXE_INCOHERENT');

    const resultat = {} as Record<CategorieCompteurOperation, number>;
    for (const categorie of Object.keys(DEFINITIONS_COMPTEURS) as CategorieCompteurOperation[]) {
        const definition = DEFINITIONS_COMPTEURS[categorie];
        const prefixe = definition.prefixe(base);
        const local = lireCompteurOperation(db, definition.table, definition.colonne, definition.sequence, prefixe);
        const serveur = Math.max(0, Math.min(999_999, Math.trunc(Number(compteurs[categorie] ?? 0))));
        const retenu = Math.max(local, Number.isFinite(serveur) ? serveur : 0);
        enregistrerCompteurOperation(db, definition.sequence, prefixe, retenu);
        resultat[categorie] = retenu;
    }

    return resultat;
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

    const compteurPrepare = Number.parseInt(numero.slice(prefixe.length), 10);
    const compteurActuel = lireCompteurOperation(db, table, colonne, sequence, prefixe);
    if (compteurPrepare !== compteurActuel + 1) {
        return null;
    }

    enregistrerCompteurOperation(db, sequence, prefixe, compteurPrepare);
    return numero;
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
    exigerPrefixeOperation(codePoste, codeAgence);
    return prevoirNumeroPrefixe(db, 'tickets', 'numero_ticket', 'ticket_sequence', codePoste, codeAgence);
}

export function prevoirNumeroBagage(db: Database.Database, codePoste?: string | null, codeAgence?: string | null): string | null {
    exigerPrefixeOperation(codePoste, codeAgence);
    return prevoirNumeroPrefixe(db, 'bagages', 'numero_bagage', 'bagage_sequence', codePoste, codeAgence);
}

export function prevoirNumeroCourrier(db: Database.Database, codePoste?: string | null, codeAgence?: string | null): string | null {
    exigerPrefixeOperation(codePoste, codeAgence);
    return prevoirNumeroPrefixe(db, 'courriers', 'numero_courrier', 'courrier_sequence', codePoste, codeAgence);
}

export function prevoirNumeroCourrierInternational(db: Database.Database, codePoste?: string | null, codeAgence?: string | null): string | null {
    exigerPrefixeOperation(codePoste, codeAgence);
    return prevoirNumeroPrefixe(db, 'courriers_internationaux', 'numero_courrier', 'courrier_international_sequence', codePoste, codeAgence);
}

export function genererNumeroTicket(db: Database.Database, codePoste?: string | null, codeAgence?: string | null, numeroPrepare?: string | null): string {
    exigerPrefixeOperation(codePoste, codeAgence);
    return utiliserNumeroPrepare(db, 'tickets', 'numero_ticket', 'ticket_sequence', codePoste, codeAgence, numeroPrepare)
        ?? genererNumeroPrefixe(db, 'tickets', 'numero_ticket', 'ticket_sequence', codePoste, codeAgence)
        ?? (() => { throw new Error('NUMEROTATION_POSTE_NON_CONFIGUREE'); })();
}

export function marquerNumeroTicketUtilise(db: Database.Database, codePoste?: string | null, codeAgence?: string | null, numero?: string | null): boolean {
    return utiliserNumeroPrepare(db, 'tickets', 'numero_ticket', 'ticket_sequence', codePoste, codeAgence, numero) !== null;
}

export function genererNumeroBagage(db: Database.Database, codePoste?: string | null, codeAgence?: string | null, numeroPrepare?: string | null): string {
    exigerPrefixeOperation(codePoste, codeAgence);
    return utiliserNumeroPrepare(db, 'bagages', 'numero_bagage', 'bagage_sequence', codePoste, codeAgence, numeroPrepare)
        ?? genererNumeroPrefixe(db, 'bagages', 'numero_bagage', 'bagage_sequence', codePoste, codeAgence)
        ?? (() => { throw new Error('NUMEROTATION_POSTE_NON_CONFIGUREE'); })();
}

export function genererNumeroCourrier(db: Database.Database, codePoste?: string | null, codeAgence?: string | null, numeroPrepare?: string | null): string {
    exigerPrefixeOperation(codePoste, codeAgence);
    return utiliserNumeroPrepare(db, 'courriers', 'numero_courrier', 'courrier_sequence', codePoste, codeAgence, numeroPrepare)
        ?? genererNumeroPrefixe(db, 'courriers', 'numero_courrier', 'courrier_sequence', codePoste, codeAgence)
        ?? (() => { throw new Error('NUMEROTATION_POSTE_NON_CONFIGUREE'); })();
}

export function genererNumeroCourrierInternational(db: Database.Database, codePoste?: string | null, codeAgence?: string | null, numeroPrepare?: string | null): string {
    exigerPrefixeOperation(codePoste, codeAgence);
    return utiliserNumeroPrepare(db, 'courriers_internationaux', 'numero_courrier', 'courrier_international_sequence', codePoste, codeAgence, numeroPrepare)
        ?? genererNumeroPrefixe(db, 'courriers_internationaux', 'numero_courrier', 'courrier_international_sequence', codePoste, codeAgence)
        ?? (() => { throw new Error('NUMEROTATION_POSTE_NON_CONFIGUREE'); })();
}

export function genererNumeroLot(
    db: Database.Database,
    type: 'courrier' | 'bagage' | 'courrier_international',
    codePoste?: string | null,
    codeAgence?: string | null,
): { numeroLot: number; reference: string } {
    const categorie: CategorieCompteurOperation = type === 'courrier'
        ? 'lot_courrier'
        : type === 'bagage' ? 'lot_bagage' : 'lot_courrier_international';
    const definition = DEFINITIONS_COMPTEURS[categorie];
    const prefixe = definition.prefixe(exigerPrefixeOperation(codePoste, codeAgence));
    const reference = genererAvecPrefixe(db, definition.table, definition.colonne, definition.sequence, prefixe);

    return { numeroLot: Number.parseInt(reference.slice(prefixe.length), 10), reference };
}

export function genererReferenceConvoi(
    db: Database.Database,
    codePoste?: string | null,
    codeAgence?: string | null,
): string {
    const definition = DEFINITIONS_COMPTEURS.convoi;
    const prefixe = definition.prefixe(exigerPrefixeOperation(codePoste, codeAgence));
    return genererAvecPrefixe(db, definition.table, definition.colonne, definition.sequence, prefixe);
}
