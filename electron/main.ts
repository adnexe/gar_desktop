import { app, BrowserWindow } from 'electron';
import { join } from 'node:path';
import { enregistrerIpc } from './ipc';
import { logger } from './logger';
import { localNetworkService } from './services/LocalNetworkService';
import { syncEngine } from './sync/SyncEngine';

const estDev = !app.isPackaged;
let fermetureEnCours = false;

function creerFenetre(): void {
    const fenetre = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 1024,
        minHeight: 700,
        title: 'GAR — Caisse',
        webPreferences: {
            preload: join(__dirname, '../preload/index.mjs'),
            contextIsolation: true,
            nodeIntegration: false,
            // Le preload est en ESM (package.json "type": "module") : Electron
            // exige de désactiver le sandbox pour charger un preload ESM.
            // contextIsolation reste actif, donc l'isolation renderer/main l'est aussi.
            sandbox: false,
        },
    });

    // Les erreurs JS du renderer (Vue, réseau...) sont invisibles dans le
    // terminal par défaut ; on les relaie vers le logger pour le support.
    fenetre.webContents.on('console-message', (details) => {
        if (details.level === 'warning' || details.level === 'error') {
            logger.warn(`[renderer] ${details.message} (${details.sourceId}:${details.lineNumber})`);
        }
    });

    if (estDev && process.env.ELECTRON_RENDERER_URL) {
        fenetre.loadURL(process.env.ELECTRON_RENDERER_URL);
        fenetre.webContents.openDevTools();
    } else {
        fenetre.loadFile(join(__dirname, '../renderer/index.html'));
    }
}

app.whenReady().then(() => {
    enregistrerIpc();
    void localNetworkService.demarrerDepuisConfig().catch((erreur) => {
        logger.warn('Serveur local non démarré.', erreur);
    });
    syncEngine.demarrer();
    creerFenetre();

    app.on('activate', () => {
        if (fermetureEnCours) return;
        if (BrowserWindow.getAllWindows().length === 0) creerFenetre();
    });
});

app.on('window-all-closed', () => {
    app.quit();
});

app.on('before-quit', (event) => {
    if (fermetureEnCours) return;

    event.preventDefault();
    fermetureEnCours = true;

    void nettoyerAvantFermeture().finally(() => {
        app.quit();
    });
});

process.on('uncaughtException', (erreur) => {
    logger.error('Erreur non interceptée', erreur);
});

async function nettoyerAvantFermeture(): Promise<void> {
    syncEngine.arreter();

    try {
        await localNetworkService.arreter();
    } catch (erreur) {
        logger.warn('Nettoyage du réseau local incomplet.', erreur);
    }
}
