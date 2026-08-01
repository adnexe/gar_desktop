import { getDb } from '../database/connection';
import { migrer } from '../database/migrate';
import { logger } from '../logger';

export type CalibrationImpression = {
    largeurPapierMm: number;
    largeurContenuMm: number;
    decalageXMm: number;
};

const CALIBRATION_DEFAUT: CalibrationImpression = {
    largeurPapierMm: 80,
    largeurContenuMm: 70,
    decalageXMm: 0,
};

const CLES = {
    largeurPapierMm: 'impression_largeur_papier_mm',
    largeurContenuMm: 'impression_largeur_contenu_mm',
    decalageXMm: 'impression_decalage_x_mm',
} as const;

function nombreEntre(valeur: unknown, defaut: number, min: number, max: number): number {
    const nombre = typeof valeur === 'number' ? valeur : Number.parseFloat(String(valeur ?? ''));
    if (!Number.isFinite(nombre)) return defaut;

    return Math.min(Math.max(nombre, min), max);
}

export function normaliserCalibrationImpression(valeur: Partial<CalibrationImpression> = {}): CalibrationImpression {
    const largeurPapierMm = nombreEntre(valeur.largeurPapierMm, CALIBRATION_DEFAUT.largeurPapierMm, 57, 90);
    const largeurContenuMm = nombreEntre(valeur.largeurContenuMm, CALIBRATION_DEFAUT.largeurContenuMm, 45, largeurPapierMm);
    const decalageXMm = nombreEntre(valeur.decalageXMm, CALIBRATION_DEFAUT.decalageXMm, -12, 12);

    return {
        largeurPapierMm: Number(largeurPapierMm.toFixed(1)),
        largeurContenuMm: Number(largeurContenuMm.toFixed(1)),
        decalageXMm: Number(decalageXMm.toFixed(1)),
    };
}

export function lireCalibrationImpression(): CalibrationImpression {
    const db = getDb();
    migrer(db);

    const lignes = db
        .prepare(`SELECT cle, valeur FROM config WHERE cle IN (?, ?, ?)`)
        .all(CLES.largeurPapierMm, CLES.largeurContenuMm, CLES.decalageXMm) as { cle: string; valeur: string | null }[];

    const valeurs = Object.fromEntries(lignes.map((ligne) => [ligne.cle, ligne.valeur]));

    return normaliserCalibrationImpression({
        largeurPapierMm: valeurs[CLES.largeurPapierMm] ?? undefined,
        largeurContenuMm: valeurs[CLES.largeurContenuMm] ?? undefined,
        decalageXMm: valeurs[CLES.decalageXMm] ?? undefined,
    });
}

export function enregistrerCalibrationImpression(valeur: Partial<CalibrationImpression>): CalibrationImpression {
    const db = getDb();
    migrer(db);

    const calibration = normaliserCalibrationImpression(valeur);
    const enregistrer = db.prepare(`
        INSERT INTO config (cle, valeur)
        VALUES (?, ?)
        ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur
    `);

    db.transaction(() => {
        enregistrer.run(CLES.largeurPapierMm, String(calibration.largeurPapierMm));
        enregistrer.run(CLES.largeurContenuMm, String(calibration.largeurContenuMm));
        enregistrer.run(CLES.decalageXMm, String(calibration.decalageXMm));
    })();

    logger.info('Calibration impression locale enregistrée', calibration);

    return calibration;
}
