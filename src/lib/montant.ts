/**
 * Coercition d'un montant en nombre.
 *
 * Les montants traversent plusieurs frontières avant d'arriver ici : colonne
 * SQLite, IPC, et surtout la synchronisation admin, où Laravel sérialise ses
 * colonnes `decimal` en CHAÎNES JSON (`"1500.00"`). Il suffit qu'une seule
 * ligne d'une liste porte une chaîne pour qu'un `reduce` bascule de l'addition
 * à la CONCATÉNATION : les montants se collent bout à bout et le total du jour
 * devient un nombre de cent chiffres.
 *
 * C'est arrivé en production sur le total des courriers. Le typage TypeScript
 * ne protège de rien ici — il décrit ce qu'on espère recevoir, pas ce qui
 * arrive vraiment.
 *
 * Une valeur illisible vaut 0 : mieux vaut un total légèrement faux qu'un
 * `NaN` propagé dans tout l'écran.
 */
export function nombre(valeur: unknown): number {
    if (typeof valeur === 'number') {
        return Number.isFinite(valeur) ? valeur : 0;
    }

    if (valeur === null || valeur === undefined || valeur === '') {
        return 0;
    }

    const converti = Number(valeur);

    return Number.isFinite(converti) ? converti : 0;
}

/** Somme d'une liste de lignes, à l'abri des montants arrivés en texte. */
export function sommeMontants<T>(lignes: readonly T[], extraire: (ligne: T) => unknown): number {
    return lignes.reduce((somme, ligne) => somme + nombre(extraire(ligne)), 0);
}
