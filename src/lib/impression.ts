// Hauteur réelle (en mm) de la zone d'impression. Transmise au main process,
// elle dimensionne la page du PDF : l'imprimante s'arrête à la fin du reçu au
// lieu de dérouler une page A4 quasi vide (plus rapide, pas de blanc inutile).
//
// La zone est en display:none à l'écran (classe `hidden`, visible seulement en
// @media print) : sa hauteur vaut donc 0 telle quelle. On la révèle hors-écran
// le temps de la mesure — invisible pour l'utilisateur.
export function hauteurZoneImpressionMm(): number | undefined {
    const zone = document.querySelector<HTMLElement>('.zone-impression');
    if (!zone) return undefined;

    const style = zone.style;
    const memo = {
        display: style.display,
        position: style.position,
        left: style.left,
        top: style.top,
        width: style.width,
    };

    style.display = 'block';
    style.position = 'absolute';
    style.left = '-10000px';
    style.top = '0';
    style.width = '72mm'; // même largeur que les reçus à l'impression

    const px = zone.scrollHeight;

    style.display = memo.display;
    style.position = memo.position;
    style.left = memo.left;
    style.top = memo.top;
    style.width = memo.width;

    if (!px) return undefined;

    return Math.ceil((px * 25.4) / 96) + 4;
}
