function mesurerZoneImpressionPx(zone: HTMLElement): number {
    const style = zone.style;
    const memo = {
        display: style.display,
        position: style.position,
        left: style.left,
        top: style.top,
        width: style.width,
        visibility: style.visibility,
        pointerEvents: style.pointerEvents,
    };

    style.setProperty('display', 'block', 'important');
    style.position = 'absolute';
    style.left = '-10000px';
    style.top = '0';
    style.width = '72mm'; // même largeur que les reçus à l'impression
    style.visibility = 'hidden';
    style.pointerEvents = 'none';

    const px = Math.max(zone.scrollHeight, zone.offsetHeight, Math.ceil(zone.getBoundingClientRect().height));

    if (memo.display) {
        style.display = memo.display;
    } else {
        style.removeProperty('display');
    }
    style.position = memo.position;
    style.left = memo.left;
    style.top = memo.top;
    style.width = memo.width;
    style.visibility = memo.visibility;
    style.pointerEvents = memo.pointerEvents;

    return px;
}

// Hauteur réelle (en mm) de la zone d'impression. Transmise au main process,
// elle dimensionne la page du PDF : l'imprimante s'arrête à la fin du reçu au
// lieu de dérouler une page A4 quasi vide (plus rapide, pas de blanc inutile).
//
// Plusieurs vues ont une zone d'impression (ticket + fin de caisse). On mesure
// donc la première zone réellement remplie, sinon on tomberait parfois sur une
// zone vide et la hauteur passerait à `undefined`.
export function hauteurZoneImpressionMm(): number | undefined {
    const zones = Array.from(document.querySelectorAll<HTMLElement>('.zone-impression'));

    for (const zone of zones) {
        const px = mesurerZoneImpressionPx(zone);
        if (px > 0) {
            return Math.ceil((px * 25.4) / 96) + 4;
        }
    }

    return undefined;
}
