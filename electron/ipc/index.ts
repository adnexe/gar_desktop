import { app, BrowserWindow, ipcMain, type IpcMainInvokeEvent, type WebContents } from 'electron';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
// pdf-to-printer est en CommonJS : import par défaut obligatoire (main en ESM).
import pdfToPrinter from 'pdf-to-printer';

const { print: imprimerFichierPdf } = pdfToPrinter;
const execFileAsync = promisify(execFile);

// Envoie un PDF à l'imprimante : SumatraPDF (pdf-to-printer) sous Windows,
// CUPS (`lp`) sous macOS/Linux — même stratégie des deux côtés : papier
// personnalisé à la taille du reçu, réduction si la page dépasse la zone
// imprimable (plutôt qu'un rognage à droite).
async function envoyerPdfImprimante(fichier: string, options: { printer?: string; paperSize?: string }): Promise<void> {
    if (process.platform === 'win32') {
        await imprimerFichierPdf(fichier, {
            ...(options.printer ? { printer: options.printer } : {}),
            ...(options.paperSize ? { paperSize: options.paperSize } : {}),
            scale: 'shrink',
        });
        return;
    }

    const args: string[] = [];
    if (options.printer) args.push('-d', options.printer.replace(/ /g, '_'));
    const dims = options.paperSize?.match(/^(\d+)mm x (\d+)mm$/);
    if (dims) args.push('-o', `media=Custom.${dims[1]}x${dims[2]}mm`);
    // La zone imprimable des thermiques est plus étroite que le papier
    // (~72 mm sur 80 mm) : sans ajustement, le pilote rogne à droite et en
    // bas. « fit-to-page » réduit très légèrement la page pour tout garder.
    args.push('-o', 'fit-to-page');
    args.push(fichier);
    await execFileAsync('lp', args);
}
import { ConfigController } from '../controllers/ConfigController';
import { AuthController } from '../controllers/AuthController';
import { AgentController } from '../controllers/AgentController';
import { ReferentielController } from '../controllers/ReferentielController';
import { VenteController } from '../controllers/VenteController';
import { BagageController } from '../controllers/BagageController';
import { CourrierController } from '../controllers/CourrierController';
import { VoyageController } from '../controllers/VoyageController';
import { HistoriqueController } from '../controllers/HistoriqueController';
import { logger } from '../logger';
import { localNetworkService } from '../services/LocalNetworkService';

type ImprimanteRuntime = Electron.PrinterInfo & {
    isDefault?: boolean;
    status?: number;
};

type ImprimanteExposee = {
    name: string;
    displayName: string;
    description: string;
    isDefault: boolean;
    status: number | null;
};

type ResultatImpression = { ok: true; imprimante: string } | { ok: false; erreur: string };

function dureeMs(debut: number): number {
    return Math.round(performance.now() - debut);
}

function nomImprimante(imprimante: ImprimanteRuntime): string {
    return imprimante.displayName || imprimante.name || 'Imprimante sans nom';
}

function optionBooleenne(imprimante: ImprimanteRuntime, cle: string): boolean {
    const options = imprimante.options as Record<string, unknown> | undefined;
    const valeur = options?.[cle];

    return valeur === true || valeur === 'true' || valeur === '1' || valeur === 1;
}

function estImprimanteParDefaut(imprimante: ImprimanteRuntime): boolean {
    return imprimante.isDefault === true
        || optionBooleenne(imprimante, 'is-default')
        || optionBooleenne(imprimante, 'printer-is-default');
}

function exposerImprimante(imprimante: ImprimanteRuntime): ImprimanteExposee {
    return {
        name: imprimante.name,
        displayName: imprimante.displayName,
        description: imprimante.description,
        isDefault: estImprimanteParDefaut(imprimante),
        status: typeof imprimante.status === 'number' ? imprimante.status : null,
    };
}

async function listerImprimantes(sender: WebContents): Promise<ImprimanteRuntime[]> {
    const debut = performance.now();

    try {
        const imprimantes = await sender.getPrintersAsync() as ImprimanteRuntime[];
        logger.info('Chrono impression - liste imprimantes', {
            duree_ms: dureeMs(debut),
            nombre: imprimantes.length,
        });

        return imprimantes;
    } catch (erreur) {
        logger.warn('Liste des imprimantes indisponible.', {
            duree_ms: dureeMs(debut),
            erreur: erreur instanceof Error ? erreur.message : String(erreur),
        });
        return [];
    }
}

function imprimerWebContents(sender: WebContents, options: Electron.WebContentsPrintOptions, libelle: string): Promise<ResultatImpression> {
    if (sender.isDestroyed()) {
        return Promise.resolve({ ok: false, erreur: 'Fenêtre d’impression introuvable.' });
    }

    const debut = performance.now();

    return new Promise((resolve) => {
        sender.print(options, (succes, raison) => {
            logger.info('Chrono impression Electron directe', {
                libelle,
                ok: succes,
                duree_ms: dureeMs(debut),
                raison: succes ? null : raison,
            });

            if (succes) {
                resolve({ ok: true, imprimante: libelle });
                return;
            }

            resolve({
                ok: false,
                erreur: raison === 'cancelled'
                    ? "Impression annulée par l'utilisateur."
                    : raison || `Impression refusée par le système (${libelle}).`,
            });
        });
    });
}

function ordonnerImprimantes(imprimantes: ImprimanteRuntime[]): ImprimanteRuntime[] {
    return [...imprimantes].sort((a, b) => Number(estImprimanteParDefaut(b)) - Number(estImprimanteParDefaut(a)));
}

// Imprimantes virtuelles (OneNote, PDF, Fax...) : jamais utilisées comme
// repli automatique — un ticket qui « s'imprime » dans OneNote est perdu.
function estImprimanteVirtuelle(imprimante: ImprimanteRuntime): boolean {
    return /onenote|fax|xps|print to pdf|pdf24|microsoft/i.test(`${imprimante.name} ${imprimante.displayName}`);
}

/**
 * Voie principale sous Windows : le module d'impression de Chromium y est
 * défaillant (« Invalid printer settings » quelles que soient les options),
 * donc on rend le reçu en PDF (fiable) puis on l'envoie à l'imprimante via
 * SumatraPDF embarqué (paquet pdf-to-printer).
 */
async function imprimerViaPdf(sender: WebContents, imprimantes: ImprimanteRuntime[], tentatives: string[], hauteurMm?: number): Promise<ResultatImpression> {
    const debutTotal = performance.now();
    const chrono = {
        hauteur_mesuree_mm: hauteurMm ?? null,
        hauteur_page_pouces: 0,
        hauteur_papier_mm: 0,
        pdf_octets: 0,
        print_to_pdf_ms: 0,
        ecriture_pdf_ms: 0,
        suppression_pdf_ms: 0,
        total_ms: 0,
        tentatives_sumatra: [] as {
            cible: string;
            format: string;
            ok: boolean;
            duree_ms: number;
            erreur?: string;
        }[],
        resultat: 'succes' as 'succes' | 'echec',
        imprimante: null as string | null,
    };

    // La hauteur de page suit la hauteur réelle du reçu (mesurée par le
    // renderer) : l'imprimante ne déroule plus une page A4 quasi vide, ce qui
    // accélère nettement la sortie et économise le papier.
    const hauteurPouces = hauteurMm
        ? Math.min(Math.max(hauteurMm / 25.4 + 0.2, 1.5), 40)
        : 11.7;
    chrono.hauteur_page_pouces = Number(hauteurPouces.toFixed(2));
    let fichier: string | null = null;
    let resultat: ResultatImpression | null = null;

    try {
        const debutPdf = performance.now();
        const pdf = await sender.printToPDF({
            printBackground: true,
            preferCSSPageSize: true,
            margins: { top: 0, bottom: 0, left: 0, right: 0 },
            // 80 mm de large (3,15 po) ; le @page du CSS prime s'il est défini.
            pageSize: { width: 3.15, height: hauteurPouces },
        });
        chrono.print_to_pdf_ms = dureeMs(debutPdf);
        chrono.pdf_octets = pdf.length;

        fichier = join(app.getPath('temp'), `adnexe-ticket-${randomUUID()}.pdf`);
        const debutEcriture = performance.now();
        await writeFile(fichier, pdf);
        chrono.ecriture_pdf_ms = dureeMs(debutEcriture);

        // Imprimante par défaut d'abord (sans nom), puis les imprimantes
        // physiques (défaut en tête) — jamais les virtuelles en repli.
        const cibles: { printer?: string; libelle: string }[] = [
            { libelle: 'imprimante par défaut' },
            ...ordonnerImprimantes(imprimantes)
                .filter((imprimante) => imprimante.name && !estImprimanteVirtuelle(imprimante))
                .map((imprimante) => ({ printer: imprimante.name, libelle: nomImprimante(imprimante) })),
        ];

        // Papier personnalisé à la taille exacte du reçu (paper=80mm x Hmm) :
        // sans lui, SumatraPDF centre la petite page sur le papier du pilote
        // (souvent 297 mm) → gros blanc avant le ticket. Repli sans format
        // personnalisé pour les pilotes qui le refusent.
        const hauteurPapierMm = Math.round(hauteurPouces * 25.4);
        chrono.hauteur_papier_mm = hauteurPapierMm;
        const formats: { paperSize?: string; libelle: string }[] = [
            { paperSize: `80mm x ${hauteurPapierMm}mm`, libelle: `80x${hauteurPapierMm}` },
            { libelle: 'papier pilote' },
        ];

        for (const cible of cibles) {
            for (const format of formats) {
                const debutSumatra = performance.now();

                try {
                    await envoyerPdfImprimante(fichier, {
                        ...(cible.printer ? { printer: cible.printer } : {}),
                        ...(format.paperSize ? { paperSize: format.paperSize } : {}),
                    });

                    const imprimante = `${cible.libelle} (PDF ${format.libelle})`;
                    chrono.tentatives_sumatra.push({
                        cible: cible.libelle,
                        format: format.libelle,
                        ok: true,
                        duree_ms: dureeMs(debutSumatra),
                    });
                    chrono.imprimante = imprimante;
                    resultat = { ok: true, imprimante };

                    return resultat;
                } catch (erreur) {
                    const message = erreur instanceof Error ? erreur.message.split('\n')[0] : String(erreur);
                    chrono.tentatives_sumatra.push({
                        cible: cible.libelle,
                        format: format.libelle,
                        ok: false,
                        duree_ms: dureeMs(debutSumatra),
                        erreur: message,
                    });
                    tentatives.push(`${cible.libelle} [PDF ${format.libelle}] : ${message}`);
                }
            }
        }

        chrono.resultat = 'echec';
        resultat = { ok: false, erreur: tentatives.join(' | ') };

        return resultat;
    } finally {
        if (fichier) {
            const debutSuppression = performance.now();
            await unlink(fichier).catch(() => undefined);
            chrono.suppression_pdf_ms = dureeMs(debutSuppression);
        }

        chrono.total_ms = dureeMs(debutTotal);
        chrono.resultat = resultat?.ok ? 'succes' : 'echec';

        logger[chrono.resultat === 'succes' ? 'info' : 'warn']('Chrono impression PDF/Sumatra', chrono);
    }
}

// Chromium (Windows) rejette l'impression silencieuse avec « Invalid printer
// settings » quand les réglages sont incomplets : il faut fournir explicitement
// dpi + pageSize. On essaie donc plusieurs formats connus, du plus adapté
// (thermique 80 mm) au plus générique, avant de retomber sur le dialogue système.
const FORMES_IMPRESSION: { libelle: string; options: Electron.WebContentsPrintOptions }[] = [
    {
        libelle: '80mm',
        options: {
            silent: true,
            printBackground: true,
            margins: { marginType: 'none' },
            dpi: { horizontal: 203, vertical: 203 },
            pageSize: { width: 80_000, height: 297_000 },
        },
    },
    {
        libelle: 'A4',
        options: {
            silent: true,
            printBackground: true,
            dpi: { horizontal: 600, vertical: 600 },
            pageSize: 'A4',
        },
    },
    {
        libelle: 'pilote',
        options: { silent: true, printBackground: true },
    },
];

async function imprimerDirect(sender: WebContents, hauteurMm?: number): Promise<ResultatImpression> {
    const tentatives: string[] = [];
    let imprimantes: ImprimanteRuntime[] | null = null;

    // La voie PDF est la seule fiable : SumatraPDF sous Windows, CUPS (`lp`)
    // sous macOS/Linux — l'impression Chromium directe échoue sur les
    // thermiques (« Invalid printer settings ») sur les deux plateformes.
    // Chemin rapide : imprimante par défaut d'abord, puis repli complet.
    if (process.platform === 'win32' || process.platform === 'darwin' || process.platform === 'linux') {
        try {
            const viaPdfDefaut = await imprimerViaPdf(sender, [], tentatives, hauteurMm);
            if (viaPdfDefaut.ok) return viaPdfDefaut;
        } catch (erreur) {
            const message = erreur instanceof Error ? erreur.message.split('\n')[0] : String(erreur);
            tentatives.push(`PDF défaut rapide : ${message}`);
        }

        imprimantes = await listerImprimantes(sender);

        try {
            const viaPdfComplet = await imprimerViaPdf(sender, imprimantes, tentatives, hauteurMm);
            if (viaPdfComplet.ok) return viaPdfComplet;
        } catch (erreur) {
            const message = erreur instanceof Error ? erreur.message.split('\n')[0] : String(erreur);
            tentatives.push(`génération PDF complète : ${message}`);
        }
    }

    imprimantes ??= await listerImprimantes(sender);

    // Cibles dans l'ordre : imprimante par défaut (deviceName absent), puis
    // chaque imprimante physique nommée (défaut en tête).
    const cibles: { deviceName?: string; libelle: string }[] = [
        { libelle: 'imprimante par défaut' },
        ...ordonnerImprimantes(imprimantes)
            .filter((imprimante) => imprimante.name && !estImprimanteVirtuelle(imprimante))
            .map((imprimante) => ({ deviceName: imprimante.name, libelle: nomImprimante(imprimante) })),
    ];

    for (const cible of cibles) {
        for (const forme of FORMES_IMPRESSION) {
            const options = cible.deviceName
                ? { ...forme.options, deviceName: cible.deviceName }
                : forme.options;
            const libelle = `${cible.libelle} [${forme.libelle}]`;

            const resultat = await imprimerWebContents(sender, options, libelle);
            if (resultat.ok) return resultat;

            tentatives.push(`${libelle} : ${resultat.erreur}`);
        }
    }

    // Dernier recours : dialogue d'impression système (l'utilisateur confirme).
    const dialogue = await imprimerWebContents(sender, { printBackground: true }, 'dialogue système');
    if (dialogue.ok) return dialogue;
    tentatives.push(`dialogue système : ${dialogue.erreur}`);

    logger.warn('Impression refusée par le système.', { tentatives, imprimantes: imprimantes.map(exposerImprimante) });

    const imprimantesDetectees = imprimantes.map(nomImprimante).join(', ');
    const prefixe = imprimantes.length === 0
        ? "Aucune imprimante n'a été détectée par l'application."
        : `Imprimantes détectées : ${imprimantesDetectees}.`;
    const detail = tentatives.slice(0, 3).join(' | ');
    const reste = tentatives.length > 3 ? ` (+${tentatives.length - 3} autres tentatives, voir le journal)` : '';

    return {
        ok: false,
        erreur: `${prefixe} ${detail}${reste}`.trim() || 'Vérifiez que l’imprimante est installée, allumée et définie par défaut.',
    };
}

async function imprimerTicketTest(): Promise<ResultatImpression> {
    const fenetre = new BrowserWindow({
        show: false,
        width: 320,
        height: 500,
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
    });

    const date = new Date().toLocaleString('fr-FR');
    const html = `
        <!doctype html>
        <html>
        <head>
            <meta charset="utf-8" />
            <style>
                @page { size: auto; margin: 0; }
                body { width: 72mm; margin: 0; font-family: Arial, sans-serif; color: #000; }
                .ticket { border: 1px solid #000; padding: 8px; font-size: 13px; }
                h1 { margin: 0 0 8px; text-align: center; font-size: 18px; }
                p { margin: 5px 0; }
                .ligne { display: flex; justify-content: space-between; border-top: 1px dashed #000; padding-top: 6px; margin-top: 8px; }
            </style>
        </head>
        <body>
            <div class="ticket">
                <h1>TEST IMPRESSION</h1>
                <p>Adnexe Transport</p>
                <p>Si ce ticket sort, l'imprimante est disponible pour l'application.</p>
                <div class="ligne"><span>Date</span><strong>${date}</strong></div>
            </div>
        </body>
        </html>`;

    try {
        await fenetre.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
        return await imprimerDirect(fenetre.webContents);
    } finally {
        if (!fenetre.isDestroyed()) fenetre.destroy();
    }
}

// Chaque canal IPC adapte 1:1 une méthode de contrôleur. Le renderer les
// appelle via window.api.* (voir preload.ts) — jamais directement ipcRenderer.
export function enregistrerIpc(): void {
    const gerer = (canal: string, fn: (...args: never[]) => unknown) => {
        ipcMain.handle(canal, async (_event, ...args: unknown[]) => {
            try {
                const proxy = await localNetworkService.proxySiClient(canal, args);
                if (proxy.proxied) return proxy.resultat;

                return await fn(...(args as never[]));
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
    gerer('config:verifierLicence', ConfigController.verifierLicence);
    gerer('config:configurer', ConfigController.configurer);
    gerer('config:actualiser', ConfigController.actualiser);
    gerer('config:reseauLocal', ConfigController.reseauLocal);
    gerer('config:configurerReseauLocal', ConfigController.configurerReseauLocal);
    gerer('config:testerReseauLocal', ConfigController.testerReseauLocal);
    gerer('config:actualiserVoyagesServeurLocal', ConfigController.actualiserVoyagesServeurLocal);
    gerer('config:relancerServeurLocal', ConfigController.relancerServeurLocal);
    gerer('config:nettoyerDonneesTest', ConfigController.nettoyerDonneesTest);

    gerer('auth:connecter', AuthController.connecter);
    gerer('auth:verifierSession', AgentController.verifierSession);

    gerer('agents:lister', AgentController.lister);
    gerer('agents:desactiver', AgentController.desactiver);
    gerer('agents:reactiver', AgentController.reactiver);
    gerer('agents:supprimerLocalement', AgentController.supprimerLocalement);

    gerer('referentiel:villes', ReferentielController.villes);
    gerer('referentiel:agencesParVille', ReferentielController.agencesParVille);
    gerer('referentiel:voyagesDeAgence', ReferentielController.voyagesDeAgence);
    gerer('referentiel:tarifsAgence', ReferentielController.tarifsAgence);
    gerer('referentiel:chauffeurs', ReferentielController.chauffeurs);
    gerer('referentiel:vehicules', ReferentielController.vehicules);

    gerer('vente:rechercherVoyages', VenteController.rechercherVoyages);
    gerer('vente:rechercherClient', VenteController.rechercherClient);
    gerer('vente:vendre', VenteController.vendre);
    gerer('vente:confirmerImpression', VenteController.confirmerImpression);
    gerer('vente:annulerImpression', VenteController.annulerImpression);
    gerer('vente:ventesDuJour', VenteController.ventesDuJour);
    gerer('vente:finDeCaisse', VenteController.finDeCaisse);
    gerer('vente:voyagesFinDeCaisse', VenteController.voyagesFinDeCaisse);

    const imprimerDepuisRenderer = async (event: IpcMainInvokeEvent, hauteurMm?: number) => {
        const fenetre = BrowserWindow.fromWebContents(event.sender);
        if (!fenetre || event.sender.isDestroyed()) {
            return { ok: false as const, erreur: 'Fenêtre d’impression introuvable.' };
        }

        // Impression directe (silencieuse) sur l'imprimante par défaut : le
        // dialogue d'impression système de webContents.print() est défaillant
        // sur Windows (n'apparaît pas, échec silencieux) et une caisse ne doit
        // de toute façon pas confirmer chaque ticket à la main.
        return await imprimerDirect(event.sender, hauteurMm);
    };

    ipcMain.handle('impression:ticket', imprimerDepuisRenderer);
    ipcMain.handle('impression:recu', imprimerDepuisRenderer);
    ipcMain.handle('impression:listerImprimantes', async (event) => (await listerImprimantes(event.sender)).map(exposerImprimante));
    ipcMain.handle('impression:tester', async () => imprimerTicketTest());
    ipcMain.handle('diagnostic:log', async (_event, niveau: 'info' | 'warn', message: string, contexte?: unknown) => {
        const details = typeof contexte === 'object' && contexte !== null ? contexte as Record<string, unknown> : { contexte };
        if (niveau === 'warn') {
            logger.warn(message, details);
        } else {
            logger.info(message, details);
        }
        return { ok: true as const };
    });

    gerer('bagage:rechercherTicket', BagageController.rechercherTicket);
    gerer('bagage:enregistrer', BagageController.enregistrer);
    gerer('bagage:confirmerImpression', BagageController.confirmerImpression);
    gerer('bagage:annulerImpression', BagageController.annulerImpression);
    gerer('bagage:duJour', BagageController.duJour);
    gerer('bagage:details', BagageController.details);
    gerer('bagage:finDeCaisse', BagageController.finDeCaisse);

    gerer('courrier:enregistrer', CourrierController.enregistrer);
    gerer('courrier:confirmerImpression', CourrierController.confirmerImpression);
    gerer('courrier:annulerImpression', CourrierController.annulerImpression);
    gerer('courrier:duJour', CourrierController.duJour);
    gerer('courrier:details', CourrierController.details);
    gerer('courrier:finDeCaisse', CourrierController.finDeCaisse);

    gerer('voyage:formulaire', VoyageController.formulaire);
    gerer('voyage:creer', VoyageController.creer);
    gerer('voyage:liste', VoyageController.liste);

    gerer('historique:duJour', HistoriqueController.duJour);
}
