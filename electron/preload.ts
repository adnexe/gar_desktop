import { contextBridge, ipcRenderer } from 'electron';

const api = {
    config: {
        estConfiguree: () => ipcRenderer.invoke('config:estConfiguree'),
        agenceActuelle: () => ipcRenderer.invoke('config:agenceActuelle'),
        compagnieActuelle: () => ipcRenderer.invoke('config:compagnieActuelle'),
        licenceActuelle: () => ipcRenderer.invoke('config:licenceActuelle'),
        reclamerLicence: (reference: string, appareil: string, codePoste?: string | null) => ipcRenderer.invoke('config:reclamerLicence', reference, appareil, codePoste),
        verifierLicence: () => ipcRenderer.invoke('config:verifierLicence'),
        configurer: (reference: string, appareil: string, codePoste?: string | null) => ipcRenderer.invoke('config:configurer', reference, appareil, codePoste),
        actualiser: () => ipcRenderer.invoke('config:actualiser'),
        synchroniserMaintenant: () => ipcRenderer.invoke('config:synchroniserMaintenant'),
        reseauLocal: () => ipcRenderer.invoke('config:reseauLocal'),
        relancerServeurLocal: () => ipcRenderer.invoke('config:relancerServeurLocal'),
        configurerReseauLocal: (params: unknown) => ipcRenderer.invoke('config:configurerReseauLocal', params),
        testerReseauLocal: (serveurUrl: string, secret: string) => ipcRenderer.invoke('config:testerReseauLocal', serveurUrl, secret),
        actualiserVoyagesServeurLocal: (agenceId: number, date?: string | null) => ipcRenderer.invoke('config:actualiserVoyagesServeurLocal', agenceId, date),
        nettoyerDonneesTest: (acteurUserId: number) => ipcRenderer.invoke('config:nettoyerDonneesTest', acteurUserId),
        resetComplet: (acteurUserId: number) => ipcRenderer.invoke('config:resetComplet', acteurUserId),
    },
    auth: {
        connecter: (identifiant: string, motDePasse: string) => ipcRenderer.invoke('auth:connecter', identifiant, motDePasse),
        verifierSession: (userId: number) => ipcRenderer.invoke('auth:verifierSession', userId),
    },
    agents: {
        lister: (agenceId: number) => ipcRenderer.invoke('agents:lister', agenceId),
        desactiver: (agentUuid: string, acteurUserId: number) => ipcRenderer.invoke('agents:desactiver', agentUuid, acteurUserId),
        reactiver: (agentUuid: string, acteurUserId: number) => ipcRenderer.invoke('agents:reactiver', agentUuid, acteurUserId),
        supprimerLocalement: (agentUuid: string, acteurUserId: number) => ipcRenderer.invoke('agents:supprimerLocalement', agentUuid, acteurUserId),
    },
    referentiel: {
        villes: () => ipcRenderer.invoke('referentiel:villes'),
        agencesParVille: (villeId: number) => ipcRenderer.invoke('referentiel:agencesParVille', villeId),
        voyagesDeAgence: (agenceId: number) => ipcRenderer.invoke('referentiel:voyagesDeAgence', agenceId),
        tarifsAgence: (agenceId: number) => ipcRenderer.invoke('referentiel:tarifsAgence', agenceId),
        chauffeurs: () => ipcRenderer.invoke('referentiel:chauffeurs'),
        vehicules: () => ipcRenderer.invoke('referentiel:vehicules'),
    },
    vente: {
        rechercherVoyages: (params: unknown) => ipcRenderer.invoke('vente:rechercherVoyages', params),
        rechercherClient: (telephone: string) => ipcRenderer.invoke('vente:rechercherClient', telephone),
        preparerNumero: () => ipcRenderer.invoke('vente:preparerNumero'),
        vendre: (demande: unknown) => ipcRenderer.invoke('vente:vendre', demande),
        confirmerImpression: (uuid: string) => ipcRenderer.invoke('vente:confirmerImpression', uuid),
        annulerImpression: (uuid: string, motif: string) => ipcRenderer.invoke('vente:annulerImpression', uuid, motif),
        ventesDuJour: (agenceId: number, date?: string, userId?: number | null) => ipcRenderer.invoke('vente:ventesDuJour', agenceId, date, userId),
        finDeCaisse: (agenceId: number, date?: string, userId?: number | null, voyageId?: number | null) => ipcRenderer.invoke('vente:finDeCaisse', agenceId, date, userId, voyageId),
        voyagesFinDeCaisse: (agenceId: number, date?: string) => ipcRenderer.invoke('vente:voyagesFinDeCaisse', agenceId, date),
    },
    impression: {
        imprimerTicket: (hauteurMm?: number) => ipcRenderer.invoke('impression:ticket', hauteurMm),
        imprimerRecu: (hauteurMm?: number) => ipcRenderer.invoke('impression:recu', hauteurMm),
        preparerPdf: (hauteurMm?: number) => ipcRenderer.invoke('impression:preparerPdf', hauteurMm),
        imprimerPdfPrepare: (id: string) => ipcRenderer.invoke('impression:imprimerPdfPrepare', id),
        supprimerPdfPrepare: (id: string) => ipcRenderer.invoke('impression:supprimerPdfPrepare', id),
        verifierDisponible: () => ipcRenderer.invoke('impression:verifierDisponible'),
        listerImprimantes: () => ipcRenderer.invoke('impression:listerImprimantes'),
        tester: () => ipcRenderer.invoke('impression:tester'),
    },
    bagage: {
        rechercherTicket: (code: string) => ipcRenderer.invoke('bagage:rechercherTicket', code),
        preparerNumero: (agenceId: number) => ipcRenderer.invoke('bagage:preparerNumero', agenceId),
        enregistrer: (demande: unknown) => ipcRenderer.invoke('bagage:enregistrer', demande),
        confirmerImpression: (uuid: string) => ipcRenderer.invoke('bagage:confirmerImpression', uuid),
        annulerImpression: (uuid: string, motif: string) => ipcRenderer.invoke('bagage:annulerImpression', uuid, motif),
        duJour: (agenceId: number, date?: string, userId?: number | null) => ipcRenderer.invoke('bagage:duJour', agenceId, date, userId),
        details: (uuid: string) => ipcRenderer.invoke('bagage:details', uuid),
        finDeCaisse: (agenceId: number, date?: string, voyageId?: number | null, userId?: number | null) => ipcRenderer.invoke('bagage:finDeCaisse', agenceId, date, voyageId, userId),
    },
    courrier: {
        preparerNumero: (agenceId: number) => ipcRenderer.invoke('courrier:preparerNumero', agenceId),
        enregistrer: (demande: unknown) => ipcRenderer.invoke('courrier:enregistrer', demande),
        confirmerImpression: (uuid: string) => ipcRenderer.invoke('courrier:confirmerImpression', uuid),
        annulerImpression: (uuid: string, motif: string) => ipcRenderer.invoke('courrier:annulerImpression', uuid, motif),
        duJour: (agenceId: number, date?: string, userId?: number | null) => ipcRenderer.invoke('courrier:duJour', agenceId, date, userId),
        details: (uuid: string) => ipcRenderer.invoke('courrier:details', uuid),
        finDeCaisse: (agenceId: number, date?: string, voyageId?: number | null, userId?: number | null) => ipcRenderer.invoke('courrier:finDeCaisse', agenceId, date, voyageId, userId),
    },
    voyage: {
        formulaire: (agenceId: number) => ipcRenderer.invoke('voyage:formulaire', agenceId),
        creer: (donnees: unknown) => ipcRenderer.invoke('voyage:creer', donnees),
        details: (uuid: string) => ipcRenderer.invoke('voyage:details', uuid),
        modifier: (uuid: string, donnees: unknown) => ipcRenderer.invoke('voyage:modifier', uuid, donnees),
        liste: (agenceId: number, date?: string) => ipcRenderer.invoke('voyage:liste', agenceId, date),
    },
    historique: {
        duJour: (agenceId: number, userId?: number | null) => ipcRenderer.invoke('historique:duJour', agenceId, userId),
    },
    diagnostic: {
        log: (niveau: 'info' | 'warn', message: string, contexte?: unknown) => ipcRenderer.invoke('diagnostic:log', niveau, message, contexte),
    },
    miseAJour: {
        // Le main process pousse cet événement quand une mise à jour a été
        // téléchargée (voir UpdateService) — pas d'appel invoke, c'est le
        // main qui initie. Retourne une fonction pour se désabonner.
        surMiseAJourPrete: (callback: (version: string) => void) => {
            const gestionnaire = (_event: unknown, version: string) => callback(version);
            ipcRenderer.on('mise-a-jour:prete', gestionnaire);
            return () => ipcRenderer.removeListener('mise-a-jour:prete', gestionnaire);
        },
    },
};

contextBridge.exposeInMainWorld('api', api);

export type Api = typeof api;
