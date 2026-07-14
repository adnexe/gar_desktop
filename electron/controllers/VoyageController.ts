import { VoyageService } from '../services/VoyageService';
import type { NouveauVoyage } from '../repositories/VoyageRepository';

const service = new VoyageService();

export const VoyageController = {
    formulaire: (agenceId: number) => service.formulaire(agenceId),
    creer: (donnees: NouveauVoyage) => service.creer(donnees),
    liste: (agenceId: number, date?: string) => service.liste(agenceId, date),
    exporterPourClient: (agenceId: number, date?: string | null) => service.exporterPourClient(agenceId, date),
};
