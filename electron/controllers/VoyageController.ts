import { VoyageService } from '../services/VoyageService';
import type { ModificationVoyage, NouveauVoyage } from '../repositories/VoyageRepository';

const service = new VoyageService();

function messageErreurGestion(erreur: unknown): { ok: false; erreur: string } | never {
    if (erreur instanceof Error && erreur.message === 'VOYAGE_GESTION_POSTE_CLIENT') {
        return { ok: false as const, erreur: 'Ce poste client ne peut pas créer ou modifier de voyage. Actualisez depuis la caisse serveur.' };
    }
    if (erreur instanceof Error && erreur.message === 'VOYAGE_INTROUVABLE') {
        return { ok: false as const, erreur: 'Ce voyage est introuvable localement.' };
    }
    throw erreur;
}

export const VoyageController = {
    formulaire: (agenceId: number) => service.formulaire(agenceId),
    creer: (donnees: NouveauVoyage) => {
        try {
            return service.creer(donnees);
        } catch (erreur) {
            return messageErreurGestion(erreur);
        }
    },
    details: (uuid: string) => service.details(uuid),
    modifier: (uuid: string, donnees: ModificationVoyage) => {
        try {
            return { ok: true as const, ...service.modifier(uuid, donnees) };
        } catch (erreur) {
            return messageErreurGestion(erreur);
        }
    },
    liste: (agenceId: number, date?: string) => service.liste(agenceId, date),
    exporterPourClient: (agenceId: number, date?: string | null) => service.exporterPourClient(agenceId, date),
};
