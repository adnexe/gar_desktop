import { VoyageService } from '../services/VoyageService';
import type { NouveauVoyage } from '../repositories/VoyageRepository';

const service = new VoyageService();

export const VoyageController = {
    formulaire: (agenceId: number) => service.formulaire(agenceId),
    creer: (donnees: NouveauVoyage) => {
        try {
            return service.creer(donnees);
        } catch (erreur) {
            if (erreur instanceof Error && erreur.message === 'VOYAGE_CREATION_POSTE_CLIENT') {
                return { ok: false as const, erreur: 'Ce poste client ne peut pas créer de voyage. Actualisez depuis la caisse serveur.' };
            }
            throw erreur;
        }
    },
    liste: (agenceId: number, date?: string) => service.liste(agenceId, date),
    exporterPourClient: (agenceId: number, date?: string | null) => service.exporterPourClient(agenceId, date),
};
