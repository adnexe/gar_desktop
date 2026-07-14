import { app, BrowserWindow } from 'electron';
import { copyFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { enregistrerIpc } from './ipc';
import { logger } from './logger';
import { localNetworkService } from './services/LocalNetworkService';
import { syncEngine } from './sync/SyncEngine';

const estDev = !app.isPackaged;
let fermetureEnCours = false;

// L'app s'appelait « gar-desktop » avant d'être renommée « Adnexe Transport » :
// le dossier de données a changé avec le nom. Au premier lancement sous le
// nouveau nom, on rapatrie la base SQLite existante pour ne rien perdre
// (configuration de l'agence, ventes non synchronisées...).
function migrerDonneesAncienNom(): void {
    const ancienDossier = join(app.getPath('appData'), 'gar-desktop');
    const nouveauDossier = app.getPath('userData');
    const dbNouvelle = join(nouveauDossier, 'gar-desktop.sqlite3');

    if (ancienDossier === nouveauDossier || existsSync(dbNouvelle) || !existsSync(ancienDossier)) {
        return;
    }

    for (const fichier of readdirSync(ancienDossier)) {
        if (fichier.startsWith('gar-desktop.sqlite3')) {
            copyFileSync(join(ancienDossier, fichier), join(nouveauDossier, fichier));
        }
    }

    logger.info(`Base locale migrée depuis ${ancienDossier}.`);
}

// Icône Adnexe Transport : fenêtre/barre des tâches sur Windows et Linux.
// Une fois l'app packagée, electron-builder détecte automatiquement
// build/icon.ico (Windows) et build/icon.icns (macOS) pour l'installateur.
const cheminIcone = join(app.getAppPath(), 'build/icon.png');

function creerFenetre(): void {
    const fenetre = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 1024,
        minHeight: 700,
        title: 'Adnexe Transport — Caisse',
        icon: cheminIcone,
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
    migrerDonneesAncienNom();

    // En dev sur macOS, le Dock affiche l'icône Electron par défaut ;
    // packagée, l'app utilise build/icon.icns.
    if (estDev && process.platform === 'darwin') {
        app.dock?.setIcon(cheminIcone);
    }

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
