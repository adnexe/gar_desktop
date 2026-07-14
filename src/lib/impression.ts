// Hauteur réelle (en mm) de la zone d'impression visible. Transmise au main
// process, elle dimensionne la page du PDF : l'imprimante s'arrête à la fin
// du reçu au lieu de dérouler une page A4 quasi vide (impression plus rapide,
// papier économisé).
export function hauteurZoneImpressionMm(): number | undefined {
    const zone = document.querySelector<HTMLElement>('.zone-impression');
    if (!zone || !zone.scrollHeight) return undefined;

    return Math.ceil((zone.scrollHeight * 25.4) / 96) + 4;
}
