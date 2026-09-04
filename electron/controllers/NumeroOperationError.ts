const MESSAGE_NUMEROTATION =
    "La numérotation de ce poste n'est pas configurée. Actualisez les données ou faites vérifier la licence et le numéro de poste.";

export function messageErreurNumerotation(erreur: unknown): string | null {
    if (!(erreur instanceof Error)) return null;

    return ['NUMEROTATION_POSTE_NON_CONFIGUREE', 'COMPTEURS_PREFIXE_INCOHERENT'].includes(erreur.message)
        ? MESSAGE_NUMEROTATION
        : null;
}
