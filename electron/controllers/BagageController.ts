import { BagageService, type DemandeBagage } from '../services/BagageService';
import { messageErreurNumerotation } from './NumeroOperationError';

const service = new BagageService();

export const BagageController = {
    rechercherTicket: (code: string) => service.rechercherTicket(code),
    preparerNumero: (agenceId: number) => service.preparerNumero(agenceId),
    enregistrer: (demande: DemandeBagage) => {
        try {
            return { ok: true as const, bagage: service.enregistrer(demande) };
        } catch (erreur) {
            const erreurNumerotation = messageErreurNumerotation(erreur);
            if (erreurNumerotation) return { ok: false as const, erreur: erreurNumerotation };
            if (erreur instanceof Error && erreur.message === 'TICKET_INTROUVABLE') {
                return { ok: false as const, erreur: 'Aucun ticket ne correspond à ce code.' };
            }
            if (erreur instanceof Error && erreur.message === 'COMPTE_NON_AUTORISE_BAGAGE') {
                return { ok: false as const, erreur: "Ce compte n'est pas autorisé à enregistrer des bagages." };
            }
            throw erreur;
        }
    },
    confirmerImpression: (uuid: string) => {
        const ok = service.confirmerImpression(uuid);

        return ok
            ? { ok: true as const }
            : { ok: false as const, erreur: "Le bagage n'est plus en attente d'impression." };
    },
    annulerImpression: (uuid: string, motif: string) => {
        service.annulerImpression(uuid, motif);

        return { ok: true as const };
    },
    duJour: (agenceId: number, date?: string, userId?: number | null) => service.duJour(agenceId, date, userId),
    details: (uuid: string) => service.details(uuid),
    finDeCaisse: (agenceId: number, date?: string, voyageId?: number | null, userId?: number | null) => service.rapportFinDeCaisse(agenceId, date, voyageId, userId),
};
