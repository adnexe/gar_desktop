import { CourrierService, type DemandeCourrier } from '../services/CourrierService';
import { messageErreurNumerotation } from './NumeroOperationError';

const service = new CourrierService();

export const CourrierController = {
    preparerNumero: (agenceId: number) => service.preparerNumero(agenceId),
    // Enveloppé en { ok, erreur } comme vente/bagage : si le service échoue,
    // le renderer reçoit une réponse propre au lieu d'une promesse rejetée
    // qui laisserait le bouton bloqué sur « Enregistrement… ».
    enregistrer: (demande: DemandeCourrier) => {
        try {
            return { ok: true as const, courrier: service.enregistrer(demande) };
        } catch (erreur) {
            const erreurNumerotation = messageErreurNumerotation(erreur);
            if (erreurNumerotation) return { ok: false as const, erreur: erreurNumerotation };
            if (erreur instanceof Error && erreur.message === 'EXPEDITEUR_DESTINATAIRE_REQUIS') {
                return { ok: false as const, erreur: 'Expéditeur et destinataire sont obligatoires.' };
            }
            if (erreur instanceof Error && erreur.message === 'COMPTE_NON_AUTORISE_COURRIER') {
                return { ok: false as const, erreur: "Ce compte n'est pas autorisé à enregistrer des courriers." };
            }
            // Toute autre erreur (contrainte SQLite, etc.) est renvoyée proprement
            // au renderer au lieu d'être relancée (promesse rejetée = bouton figé).
            return { ok: false as const, erreur: erreur instanceof Error ? erreur.message : "L'enregistrement a échoué." };
        }
    },
    confirmerImpression: (uuid: string) => {
        const ok = service.confirmerImpression(uuid);

        return ok
            ? { ok: true as const }
            : { ok: false as const, erreur: "Le courrier n'est plus en attente d'impression." };
    },
    annulerImpression: (uuid: string, motif: string) => {
        service.annulerImpression(uuid, motif);

        return { ok: true as const };
    },
    duJour: (agenceId: number, date?: string, userId?: number | null) => service.duJour(agenceId, date, userId),
    details: (uuid: string) => service.details(uuid),
    finDeCaisse: (agenceId: number, date?: string, voyageId?: number | null, userId?: number | null) => service.rapportFinDeCaisse(agenceId, date, voyageId, userId),
};
