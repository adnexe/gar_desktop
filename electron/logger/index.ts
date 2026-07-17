import { app } from 'electron';
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

type Niveau = 'info' | 'warn' | 'error';

let cheminLogMemo: string | null = null;

function cheminLog(): string | null {
    if (cheminLogMemo) return cheminLogMemo;
    if (!app.isReady()) return null;

    const dossier = join(app.getPath('userData'), 'l ogs');
    mkdirSync(dossier, { recursive: true });
    cheminLogMemo = join(dossier, 'app.log');

    return cheminLogMemo;
}

function contexteTexte(contexte: unknown): string {
    if (contexte === undefined) return '';

    if (contexte instanceof Error) {
        return ` ${contexte.stack ?? contexte.message}`;
    }

    try {
        return ` ${JSON.stringify(contexte)}`;
    } catch {
        return ` ${String(contexte)}`;
    }
}

function ecrire(niveau: Niveau, message: string, contexte?: unknown): void {
    const horodatage = new Date().toISOString();
    const ligne = `[${horodatage}] [${niveau.toUpperCase()}] ${message}`;

    if (contexte !== undefined) {
        // eslint-disable-next-line no-console
        console[niveau === 'info' ? 'log' : niveau](ligne, contexte);
    } else {
        // eslint-disable-next-line no-console
        console[niveau === 'info' ? 'log' : niveau](ligne);
    }

    try {
        const fichier = cheminLog();
        if (fichier) {
            appendFileSync(fichier, `${ligne}${contexteTexte(contexte)}\n`, 'utf8');
        }
    } catch {
        // Le logger ne doit jamais casser l'application.
    }
}

export const logger = {
    info: (message: string, contexte?: unknown) => ecrire('info', message, contexte),
    warn: (message: string, contexte?: unknown) => ecrire('warn', message, contexte),
    error: (message: string, contexte?: unknown) => ecrire('error', message, contexte),
};
