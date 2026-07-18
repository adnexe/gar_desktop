import { contextBridge, ipcRenderer } from 'electron';

const api = {
    config: {
        estConfiguree: () => ipcRenderer.invoke('config:estConfiguree'),
        agenceActuelle: () => ipcRenderer.invoke('config:agenceActuelle'),
        compagnieActuelle: () => ipcRenderer.invoke('config:compagnieActuelle'),
        licenceActuelle: () => ipcRenderer.invoke('config:licenceActuelle'),
        reclamerLicence: (reference: string, appareil: string) => ipcRenderer.invoke('config:reclamerLicence', reference, appareil),
        verifierLicence: () => ipcRenderer.invoke('config:verifierLicence'),
        configurer: (reference: string, appareil: string) => ipcRenderer.invoke('config:configurer', reference, appareil),
        actualiser: () => ipcRenderer.invoke('config:actualiser'),
        reseauLocal: () => ipcRenderer.invoke('config:reseauLocal'),
        configurerReseauLocal: (params: unknown) => ipcRenderer.invoke('config:configurerReseauLocal', params),
        testerReseauLocal: (serveurUrl: string, secret: string) => ipcRenderer.invoke('config:testerReseauLocal', serveurUrl, secret),
        actualiserVoyagesServeurLocal: (agenceId: number, date?: string | null) => ipcRenderer.invoke('config:actualiserVoyagesServeurLocal', agenceId, date),
        nettoyerDonneesTest: (acteurUserId: number) => ipcRenderer.invoke('config:nettoyerDonneesTest', acteurUserId),
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
        finDeCaisse: (agenceId: number, date?: string, userId?: number | null) => ipcRenderer.invoke('vente:finDeCaisse', agenceId, date, userId),
    },
    impression: {
        imprimerTicket: (hauteurMm?: number) => ipcRenderer.invoke('impression:ticket', hauteurMm),
        imprimerRecu: (hauteurMm?: number) => ipcRenderer.invoke('impression:recu', hauteurMm),
        preparerPdf: (hauteurMm?: number) => ipcRenderer.invoke('impression:preparerPdf', hauteurMm),
        imprimerPdfPrepare: (id: string) => ipcRenderer.invoke('impression:imprimerPdfPrepare', id),
        supprimerPdfPrepare: (id: string) => ipcRenderer.invoke('impression:supprimerPdfPrepare', id),
        listerImprimantes: () => ipcRenderer.invoke('impression:listerImprimantes'),
        tester: () => ipcRenderer.invoke('impression:tester'),
    },
    bagage: {
        rechercherTicket: (code: string) => ipcRenderer.invoke('bagage:rechercherTicket', code),
        preparerNumero: (agenceId: number) => ipcRenderer.invoke('bagage:preparerNumero', agenceId),
        enregistrer: (demande: unknown) => ipcRenderer.invoke('bagage:enregistrer', demande),
        confirmerImpression: (uuid: string) => ipcRenderer.invoke('bagage:confirmerImpression', uuid),
        annulerImpression: (uuid: string, motif: string) => ipcRenderer.invoke('bagage:annulerImpression', uuid, motif),
        duJour: (agenceId: number, date?: string) => ipcRenderer.invoke('bagage:duJour', agenceId, date),
        finDeCaisse: (agenceId: number, date?: string) => ipcRenderer.invoke('bagage:finDeCaisse', agenceId, date),
    },
    courrier: {
        preparerNumero: (agenceId: number) => ipcRenderer.invoke('courrier:preparerNumero', agenceId),
        enregistrer: (demande: unknown) => ipcRenderer.invoke('courrier:enregistrer', demande),
        confirmerImpression: (uuid: string) => ipcRenderer.invoke('courrier:confirmerImpression', uuid),
        annulerImpression: (uuid: string, motif: string) => ipcRenderer.invoke('courrier:annulerImpression', uuid, motif),
        duJour: (agenceId: number, date?: string) => ipcRenderer.invoke('courrier:duJour', agenceId, date),
        finDeCaisse: (agenceId: number, date?: string) => ipcRenderer.invoke('courrier:finDeCaisse', agenceId, date),
    },
    voyage: {
        formulaire: (agenceId: number) => ipcRenderer.invoke('voyage:formulaire', agenceId),
        creer: (donnees: unknown) => ipcRenderer.invoke('voyage:creer', donnees),
        liste: (agenceId: number, date?: string) => ipcRenderer.invoke('voyage:liste', agenceId, date),
    },
    historique: {
        duJour: (agenceId: number) => ipcRenderer.invoke('historique:duJour', agenceId),
    },
    diagnostic: {
        log: (niveau: 'info' | 'warn', message: string, contexte?: unknown) => ipcRenderer.invoke('diagnostic:log', niveau, message, contexte),
    },
};

contextBridge.exposeInMainWorld('api', api);

export type Api = typeof api;
