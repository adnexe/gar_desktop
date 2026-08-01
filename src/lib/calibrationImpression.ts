export type CalibrationImpression = {
    largeurPapierMm: number;
    largeurContenuMm: number;
    decalageXMm: number;
};

export const CALIBRATION_IMPRESSION_DEFAUT: CalibrationImpression = {
    largeurPapierMm: 80,
    largeurContenuMm: 76,
    decalageXMm: 0,
};

function nombreEntre(valeur: unknown, defaut: number, min: number, max: number): number {
    const nombre = typeof valeur === 'number' ? valeur : Number.parseFloat(String(valeur ?? ''));
    if (!Number.isFinite(nombre)) return defaut;

    return Math.min(Math.max(nombre, min), max);
}

export function normaliserCalibrationImpression(valeur: Partial<CalibrationImpression> = {}): CalibrationImpression {
    const largeurPapierMm = nombreEntre(valeur.largeurPapierMm, CALIBRATION_IMPRESSION_DEFAUT.largeurPapierMm, 57, 90);
    const largeurContenuMm = nombreEntre(valeur.largeurContenuMm, CALIBRATION_IMPRESSION_DEFAUT.largeurContenuMm, 45, largeurPapierMm);
    const decalageXMm = nombreEntre(valeur.decalageXMm, CALIBRATION_IMPRESSION_DEFAUT.decalageXMm, -12, 12);

    return {
        largeurPapierMm: Number(largeurPapierMm.toFixed(1)),
        largeurContenuMm: Number(largeurContenuMm.toFixed(1)),
        decalageXMm: Number(decalageXMm.toFixed(1)),
    };
}

export function appliquerCalibrationImpression(valeur: Partial<CalibrationImpression>): CalibrationImpression {
    const calibration = normaliserCalibrationImpression(valeur);
    const racine = document.documentElement;

    racine.style.setProperty('--impression-largeur-papier', `${calibration.largeurPapierMm}mm`);
    racine.style.setProperty('--impression-largeur-contenu', `${calibration.largeurContenuMm}mm`);
    racine.style.setProperty('--impression-decalage-x', `${calibration.decalageXMm}mm`);

    return calibration;
}

export async function initialiserCalibrationImpression(): Promise<CalibrationImpression> {
    try {
        const calibration = await window.api.config.calibrationImpression();

        return appliquerCalibrationImpression(calibration);
    } catch {
        return appliquerCalibrationImpression(CALIBRATION_IMPRESSION_DEFAUT);
    }
}
