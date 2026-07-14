import { BootstrapService } from '../services/BootstrapService';
import { localNetworkService, type ModeReseauLocal } from '../services/LocalNetworkService';

const service = new BootstrapService();

export const ConfigController = {
    estConfiguree: () => service.estConfiguree(),
    agenceActuelle: () => service.agenceActuelle(),
    compagnieActuelle: () => service.compagnieActuelle(),
    licenceActuelle: () => service.licenceActuelle(),
    reclamerLicence: (reference: string, appareil: string) => service.reclamerLicence(reference, appareil),
    configurer: (reference: string, appareil: string) => service.configurer(reference, appareil),
    actualiser: async () => {
        try {
            return { ok: true as const, agence: await service.actualiser() };
        } catch {
            // Hors-ligne ou serveur injoignable : l'app continue avec les
            // données locales, on signale juste l'échec à l'interface.
            return { ok: false as const };
        }
    },
    reseauLocal: () => localNetworkService.configuration(),
    configurerReseauLocal: (params: { mode: ModeReseauLocal; serveurUrl?: string | null; port?: number | null; secret?: string | null }) =>
        localNetworkService.configurer(params),
    testerReseauLocal: (serveurUrl: string, secret: string) => localNetworkService.testerClient(serveurUrl, secret),
    actualiserVoyagesServeurLocal: (agenceId: number, date?: string | null) => localNetworkService.actualiserVoyagesDepuisServeur(agenceId, date),
};
