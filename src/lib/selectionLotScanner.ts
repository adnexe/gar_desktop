export interface ElementLotScannable {
    uuid: string;
    numero: string;
    groupe: string;
}

export type ResultatSelectionScanner =
    | { statut: 'selectionne'; element: ElementLotScannable }
    | { statut: 'deja_selectionne'; element: ElementLotScannable }
    | { statut: 'autre_groupe'; element: ElementLotScannable }
    | { statut: 'introuvable'; numero: string }
    | { statut: 'vide' };

export function normaliserNumeroScanne(valeur: string): string {
    return valeur.trim().toLocaleUpperCase('fr-FR');
}

export function resoudreSelectionScanner(
    valeur: string,
    elements: ElementLotScannable[],
    selection: string[],
    groupeChoisi: string,
): ResultatSelectionScanner {
    const numero = normaliserNumeroScanne(valeur);
    if (!numero) return { statut: 'vide' };

    const element = elements.find((candidat) => normaliserNumeroScanne(candidat.numero) === numero);
    if (!element) return { statut: 'introuvable', numero };
    if (selection.includes(element.uuid)) return { statut: 'deja_selectionne', element };
    if (selection.length > 0 && element.groupe !== groupeChoisi) return { statut: 'autre_groupe', element };
    return { statut: 'selectionne', element };
}
