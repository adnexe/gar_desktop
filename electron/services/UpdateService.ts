import { BrowserWindow } from 'electron';
// electron-updater est en CommonJS : import par défaut obligatoire (main en ESM).
import electronUpdater from 'electron-updater';
import { logger } from '../logger';

const { autoUpdater } = electronUpdater;

const QUATRE_HEURES_MS = 4 * 60 * 60 * 1000;

// Mise à jour automatique : le fichier de config (electron-builder "publish")
// pointe vers std.adnexe.com/updates/desktop/. On télécharge en arrière-plan
// dès qu'une version plus récente est trouvée, mais on ne l'installe jamais
// pendant une vente en cours — l'installation se fait uniquement à la
// prochaine fermeture normale de l'app (autoInstallOnAppQuit), jamais forcée.
class UpdateService {
    private demarre = false;

    demarrer(): void {
        if (this.demarre) return;
        this.demarre = true;

        autoUpdater.autoDownload = true;
        autoUpdater.autoInstallOnAppQuit = true;
        autoUpdater.logger = null;

        autoUpdater.on('update-available', (info) => {
            logger.info(`Mise à jour disponible : ${info.version}. Téléchargement en arrière-plan.`);
        });

        autoUpdater.on('update-downloaded', (info) => {
            logger.info(`Mise à jour ${info.version} téléchargée : sera installée à la prochaine fermeture de l'app.`);
            this.notifierRenderer(info.version);
        });

        autoUpdater.on('error', (erreur) => {
            logger.warn('Vérification/téléchargement de mise à jour échoué.', erreur);
        });

        this.verifier();
        setInterval(() => this.verifier(), QUATRE_HEURES_MS);
    }

    private verifier(): void {
        autoUpdater.checkForUpdates().catch((erreur) => {
            logger.warn('Vérification de mise à jour impossible (pas grave, réessaiera plus tard).', erreur);
        });
    }

    private notifierRenderer(version: string): void {
        for (const fenetre of BrowserWindow.getAllWindows()) {
            fenetre.webContents.send('mise-a-jour:prete', version);
        }
    }
}

export const updateService = new UpdateService();
