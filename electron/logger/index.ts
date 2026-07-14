type Niveau = 'info' | 'warn' | 'error';

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
}

export const logger = {
    info: (message: string, contexte?: unknown) => ecrire('info', message, contexte),
    warn: (message: string, contexte?: unknown) => ecrire('warn', message, contexte),
    error: (message: string, contexte?: unknown) => ecrire('error', message, contexte),
};
