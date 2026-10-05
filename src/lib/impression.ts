// Hauteur réelle (en mm) de la zone d'impression. Transmise au main process,
// elle dimensionne la page du PDF : l'imprimante s'arrête à la fin du reçu au
// lieu de dérouler une page A4 quasi vide (plus rapide, pas de blanc inutile).
//
// La zone est en display:none à l'écran (classe `hidden`, visible seulement en
// @media print) : sa hauteur vaut donc 0 telle quelle. On la révèle hors-écran
// le temps de la mesure — invisible pour l'utilisateur.
function journaliserCalibrationImpression(contexte: {
    largeurPapier: string;
    largeurContenu: string;
    decalageX: string;
    hauteurMm?: number;
    zones: number;
}) {
    void window.api.diagnostic?.log?.('info', 'Calibration impression renderer', contexte);
}

/**
 * Attend que la zone d'impression soit REELLEMENT rendue avant de la mesurer
 * et de la capturer.
 *
 * `nextTick()` ne garantit que la mise a jour du DOM par Vue. Il ne dit rien
 * de la mise en page du navigateur, ni du decodage des images. Sur la toute
 * premiere impression d'un recu — sous-arbre fraichement monte, logo pas
 * encore decode — Chromium capturait une page incomplete : le recu ET le talon
 * sortaient tronques, puis une reimpression du meme talon, sur un rendu deja
 * chaud, sortait parfaite. C'etait toute l'enigme.
 *
 * Deux attentes, dans cet ordre :
 * 1. le decodage des images de la zone (le logo de la compagnie) ;
 * 2. deux images successives — une seule ne suffit pas, la premiere ne fait
 *    que programmer la mise en page, la seconde garantit qu'elle a eu lieu.
 *
 * Les impressions A4 (impressionA4.ts) et les convois faisaient deja l'un ou
 * l'autre. Le chemin thermique, lui, ne faisait ni l'un ni l'autre.
 */
export async function attendreRenduImpression(): Promise<void> {
    const images = Array.from(document.querySelectorAll<HTMLImageElement>('.zone-impression img'));
    await Promise.all(images.map((image) => image.decode().catch(() => undefined)));

    await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
}

export function hauteurZoneImpressionMm(): number | undefined {
    // Une page peut porter plusieurs zones (fin de caisse dans la page, reçu
    // du formulaire dans un dialog portalé en fin de body…) : on mesure
    // chacune et on garde la plus haute — c'est celle qui contient le reçu à
    // imprimer, les autres sont vides (leur contenu est en v-if).
    const zones = Array.from(document.querySelectorAll<HTMLElement>('.zone-impression'));
    if (zones.length === 0) return undefined;

    const stylesRacine = getComputedStyle(document.documentElement);
    const largeurPapier = stylesRacine.getPropertyValue('--impression-largeur-papier').trim() || '80mm';
    const largeurContenu = stylesRacine.getPropertyValue('--impression-largeur-contenu').trim() || '70mm';
    const decalageX = stylesRacine.getPropertyValue('--impression-decalage-x').trim() || '0mm';

    let px = 0;
    for (const zone of zones) {
        zone.style.setProperty('--impression-largeur-papier', largeurPapier);
        zone.style.setProperty('--impression-largeur-contenu', largeurContenu);
        zone.style.setProperty('--impression-decalage-x', decalageX);

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
        style.width = largeurPapier; // largeur papier locale ; le reçu est centré dedans

        px = Math.max(px, zone.scrollHeight);

        style.display = memo.display;
        style.position = memo.position;
        style.left = memo.left;
        style.top = memo.top;
        style.width = memo.width;
    }

    if (!px) {
        journaliserCalibrationImpression({ largeurPapier, largeurContenu, decalageX, zones: zones.length });
        return undefined;
    }

    // Marge de sécurité verticale pour les arrondis de rendu des pilotes.
    const hauteurMm = Math.ceil((px * 25.4) / 96) + 10;
    journaliserCalibrationImpression({ largeurPapier, largeurContenu, decalageX, hauteurMm, zones: zones.length });

    return hauteurMm;
}
