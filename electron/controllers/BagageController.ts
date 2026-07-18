import { BagageService, type DemandeBagage } from '../services/BagageService';

const service = new BagageService();

export const BagageController = {
    rechercherTicket: (code: string) => service.rechercherTicket(code),
    preparerNumero: (agenceId: number) => service.preparerNumero(agenceId),
    enregistrer: (demande: DemandeBagage) => {
        try {
            return { ok: true as const, bagage: service.enregistrer(demande) };
        } catch (erreur) {
            if (erreur instanceof Error && erreur.message === 'TICKET_INTROUVABLE') {
                return { ok: false as const, erreur: 'Aucun ticket ne correspond à ce code.' };
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
    duJour: (agenceId: number, date?: string) => service.duJour(agenceId, date),
    finDeCaisse: (agenceId: number, date?: string) => service.rapportFinDeCaisse(agenceId, date),
};
