import '@/assets/bordereaux-pos.css';

export type FormatBordereau = 'a4' | 'pos';

export function dimensionsBordereauPos() {
    const style = getComputedStyle(document.documentElement);
    const lire = (cle: string, defaut: number) => {
        const valeur = Number.parseFloat(style.getPropertyValue(cle));
        return Number.isFinite(valeur) ? valeur : defaut;
    };
    const papier = Math.min(90, Math.max(57, lire('--impression-largeur-papier', 80)));
    const contenu = Math.min(papier - 4, Math.max(45, lire('--impression-largeur-contenu', 76)));
    const decalage = lire('--impression-decalage-x', 0);
    const gauche = Math.min(papier - contenu, Math.max(0, (papier - contenu) / 2 + decalage));
    return { papier, contenu, gauche };
}

function mesurerHauteurPos(zone: HTMLElement, papier: number): number {
    const precedent = zone.style.cssText;
    try {
        Object.assign(zone.style, { display: 'block', position: 'absolute', left: '-10000px', top: '0', width: `${papier}mm`, height: 'auto' });
        // Un long bordereau se poursuit sur plusieurs pages, sans etre tronque.
        return Math.min(1000, Math.max(60, Math.ceil(Math.max(zone.scrollHeight, zone.getBoundingClientRect().height) * 25.4 / 96) + 6));
    } finally {
        zone.style.cssText = precedent;
    }
}

let impressionEnCours = false;

export async function imprimerBordereau(format: FormatBordereau = 'a4'): Promise<{ ok: boolean; erreur?: string }> {
    if (impressionEnCours) throw new Error('Une impression de bordereau est déjà en cours.');
    const zone = document.querySelector<HTMLElement>('.zone-impression-a4');
    if (!zone) throw new Error('Aucun bordereau à imprimer.');
    if (format !== 'a4' && format !== 'pos') throw new Error('Format de papier non reconnu.');
    impressionEnCours = true;
    const reglesPage = document.createElement('style');
    reglesPage.dataset.impressionA4 = 'active';
    try {
        document.head.appendChild(reglesPage);
        const pos = dimensionsBordereauPos();
        if (format === 'pos') {
            reglesPage.textContent = `.zone-impression-a4 { --bordereau-papier: ${pos.papier}mm; --bordereau-contenu: ${pos.contenu}mm; --bordereau-gauche: ${pos.gauche}mm; }`;
        }
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        const hauteur = format === 'pos' ? mesurerHauteurPos(zone, pos.papier) : 297;
        reglesPage.textContent += format === 'a4'
            ? '@page { size: A4 portrait; margin: 10mm; }'
            : `@page { size: ${pos.papier}mm ${hauteur}mm; margin: 2mm 0; }
                @media print { body.impression-a4-active .zone-impression-a4 { width: ${pos.papier}mm; max-width: 100%; } }`;
        document.body.classList.add('impression-a4-active');
        // Les deux formats gardent le dialogue classique, jamais le service
        // silencieux des ventes ni SumatraPDF.
        window.print();
        return { ok: true };
    } finally {
        document.body.classList.remove('impression-a4-active');
        reglesPage.remove();
        impressionEnCours = false;
    }
}

export function imprimerBordereauA4() {
    return imprimerBordereau('a4');
}
