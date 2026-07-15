import axios from 'axios';
import { apiBaseUrl } from '../apiClient';
import { BootstrapService } from '../services/BootstrapService';
import { localNetworkService, type ModeReseauLocal } from '../services/LocalNetworkService';

const service = new BootstrapService();

function messageErreurActualisation(erreur: unknown): string {
    if (axios.isAxiosError(erreur)) {
        const status = erreur.response?.status;
        if (status === 429) {
            return "Trop d'actualisations en peu de temps. Réessayez dans une minute.";
        }

        if (status === 404) {
            return "L'agence n'a pas été trouvée ou elle est désactivée côté admin.";
        }

        if (status === 401 || status === 403) {
            return "L'accès à admin n'est pas autorisé. Relancez la configuration si le problème continue.";
        }

        if (status && status >= 500) {
            return "Admin rencontre une erreur. Réessayez dans quelques instants.";
        }

        if (erreur.code === 'ECONNREFUSED') {
            return "Admin n'est pas disponible. Vérifiez qu'il est lancé, puis réessayez.";
        }
        if (erreur.code === 'ECONNABORTED' || erreur.code === 'ETIMEDOUT') {
            return "Admin met trop de temps à répondre. Réessayez dans quelques instants.";
        }
        if (erreur.code === 'ENOTFOUND' || erreur.code === 'EAI_AGAIN') {
            return "Adresse admin introuvable. Vérifiez la connexion internet ou la configuration.";
        }

        return "Impossible d'actualiser depuis admin. Les données locales restent disponibles.";
    }

    return "Impossible d'actualiser depuis admin. Les données locales restent disponibles.";
}

export const ConfigController = {
    estConfiguree: () => service.estConfiguree(),
    agenceActuelle: () => service.agenceActuelle(),
    compagnieActuelle: () => service.compagnieActuelle(),
    licenceActuelle: () => service.licenceActuelle(),
    reclamerLicence: (reference: string, appareil: string) => service.reclamerLicence(reference, appareil),
    verifierLicence: async () => {
        await service.verifierLicenceEnLigne();
        return service.licenceActuelle();
    },
    configurer: (reference: string, appareil: string) => service.configurer(reference, appareil),
    actualiser: async () => {
        try {
            return { ok: true as const, agence: await service.actualiser(), baseUrl: apiBaseUrl() };
        } catch (erreur) {
            // Hors-ligne ou serveur injoignable : l'app continue avec les
            // données locales, on signale juste l'échec à l'interface.
            return { ok: false as const, erreur: messageErreurActualisation(erreur), baseUrl: apiBaseUrl() };
        }
    },
    reseauLocal: () => localNetworkService.configuration(),
    configurerReseauLocal: (params: { mode: ModeReseauLocal; serveurUrl?: string | null; port?: number | null; secret?: string | null }) =>
        localNetworkService.configurer(params),
    testerReseauLocal: (serveurUrl: string, secret: string) => localNetworkService.testerClient(serveurUrl, secret),
    actualiserVoyagesServeurLocal: (agenceId: number, date?: string | null) => localNetworkService.actualiserVoyagesDepuisServeur(agenceId, date),
};
