import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron';
import { ConfigController } from '../controllers/ConfigController';
import { AuthController } from '../controllers/AuthController';
import { ReferentielController } from '../controllers/ReferentielController';
import { VenteController } from '../controllers/VenteController';
import { BagageController } from '../controllers/BagageController';
import { CourrierController } from '../controllers/CourrierController';
import { VoyageController } from '../controllers/VoyageController';
import { HistoriqueController } from '../controllers/HistoriqueController';
import { logger } from '../logger';
import { localNetworkService } from '../services/LocalNetworkService';

// Chaque canal IPC adapte 1:1 une méthode de contrôleur. Le renderer les
// appelle via window.api.* (voir preload.ts) — jamais directement ipcRenderer.
export function enregistrerIpc(): void {
    const gerer = (canal: string, fn: (...args: never[]) => unknown) => {
        ipcMain.handle(canal, async (_event, ...args: never[]) => {
            try {
                const proxy = await localNetworkService.proxySiClient(canal, args);
                if (proxy.proxied) return proxy.resultat;

                return await fn(...args);
            } catch (erreur) {
                logger.error(`IPC ${canal} a échoué`, erreur);
                throw erreur;
            }
        });
    };

    gerer('config:estConfiguree', ConfigController.estConfiguree);
    gerer('config:agenceActuelle', ConfigController.agenceActuelle);
    gerer('config:compagnieActuelle', ConfigController.compagnieActuelle);
    gerer('config:licenceActuelle', ConfigController.licenceActuelle);
    gerer('config:reclamerLicence', ConfigController.reclamerLicence);
    gerer('config:configurer', ConfigController.configurer);
    gerer('config:actualiser', ConfigController.actualiser);
    gerer('config:reseauLocal', ConfigController.reseauLocal);
    gerer('config:configurerReseauLocal', ConfigController.configurerReseauLocal);
    gerer('config:testerReseauLocal', ConfigController.testerReseauLocal);
    gerer('config:actualiserVoyagesServeurLocal', ConfigController.actualiserVoyagesServeurLocal);

    gerer('auth:connecter', AuthController.connecter);

    gerer('referentiel:villes', ReferentielController.villes);
    gerer('referentiel:agencesParVille', ReferentielController.agencesParVille);
    gerer('referentiel:voyagesDeAgence', ReferentielController.voyagesDeAgence);

    gerer('vente:rechercherVoyages', VenteController.rechercherVoyages);
    gerer('vente:rechercherClient', VenteController.rechercherClient);
    gerer('vente:vendre', VenteController.vendre);
    gerer('vente:confirmerImpression', VenteController.confirmerImpression);
    gerer('vente:annulerImpression', VenteController.annulerImpression);
    gerer('vente:ventesDuJour', VenteController.ventesDuJour);
    gerer('vente:finDeCaisse', VenteController.finDeCaisse);

    const imprimerDepuisRenderer = async (event: IpcMainInvokeEvent) => {
        const fenetre = BrowserWindow.fromWebContents(event.sender);
        if (!fenetre || event.sender.isDestroyed()) {
            return { ok: false as const, erreur: 'Fenêtre d’impression introuvable.' };
        }

        return await new Promise<{ ok: true } | { ok: false; erreur: string }>((resolve) => {
            event.sender.print({ printBackground: true }, (succes, raison) => {
                if (succes) {
                    resolve({ ok: true });
                    return;
                }

                resolve({
                    ok: false,
                    erreur: raison === 'cancelled'
                        ? "Impression annulée par l'utilisateur."
                        : raison || 'Impression annulée ou refusée par le système.',
                });
            });
        });
    };

    ipcMain.handle('impression:ticket', imprimerDepuisRenderer);
    ipcMain.handle('impression:recu', imprimerDepuisRenderer);

    gerer('bagage:rechercherTicket', BagageController.rechercherTicket);
    gerer('bagage:enregistrer', BagageController.enregistrer);
    gerer('bagage:confirmerImpression', BagageController.confirmerImpression);
    gerer('bagage:annulerImpression', BagageController.annulerImpression);
    gerer('bagage:duJour', BagageController.duJour);
    gerer('bagage:finDeCaisse', BagageController.finDeCaisse);

    gerer('courrier:enregistrer', CourrierController.enregistrer);
    gerer('courrier:confirmerImpression', CourrierController.confirmerImpression);
    gerer('courrier:annulerImpression', CourrierController.annulerImpression);
    gerer('courrier:duJour', CourrierController.duJour);
    gerer('courrier:finDeCaisse', CourrierController.finDeCaisse);

    gerer('voyage:formulaire', VoyageController.formulaire);
    gerer('voyage:creer', VoyageController.creer);
    gerer('voyage:liste', VoyageController.liste);

    gerer('historique:duJour', HistoriqueController.duJour);
}
