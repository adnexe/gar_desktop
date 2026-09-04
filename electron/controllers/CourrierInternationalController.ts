import { CourrierInternationalService, type DemandeCourrierInternational } from '../services/CourrierInternationalService';
import { messageErreurNumerotation } from './NumeroOperationError';

const service = new CourrierInternationalService();

export const CourrierInternationalController = {
    preparerNumero: (agenceId: number) => service.preparerNumero(agenceId),
    enregistrer: (demande: DemandeCourrierInternational) => {
        try {
            return { ok: true as const, courrier: service.enregistrer(demande) };
        } catch (erreur) {
            const erreurNumerotation = messageErreurNumerotation(erreur);
            if (erreurNumerotation) return { ok: false as const, erreur: erreurNumerotation };
            if (erreur instanceof Error && erreur.message === 'EXPEDITEUR_DESTINATAIRE_REQUIS') {
                return { ok: false as const, erreur: 'Expéditeur et destinataire sont obligatoires.' };
            }
            if (erreur instanceof Error && erreur.message === 'DESTINATION_REQUISE') {
                return { ok: false as const, erreur: 'Pays et ville de destination sont obligatoires.' };
            }
            if (erreur instanceof Error && erreur.message === 'COLIS_REQUIS') {
                return { ok: false as const, erreur: 'Ajoutez au moins un colis.' };
            }
            if (erreur instanceof Error && erreur.message === 'COMPTE_NON_AUTORISE_COURRIER_INTERNATIONAL') {
                return { ok: false as const, erreur: "Ce compte n'est pas autorisé à enregistrer des courriers internationaux." };
            }

            return { ok: false as const, erreur: erreur instanceof Error ? erreur.message : "L'enregistrement a échoué." };
        }
    },
    confirmerImpression: (uuid: string) => {
        const ok = service.confirmerImpression(uuid);

        return ok
            ? { ok: true as const }
            : { ok: false as const, erreur: "Le courrier international n'est plus en attente d'impression." };
    },
    annulerImpression: (uuid: string, motif: string) => {
        service.annulerImpression(uuid, motif);

        return { ok: true as const };
    },
    duJour: (agenceId: number, date?: string, userId?: number | null) => service.duJour(agenceId, date, userId),
    details: (uuid: string) => service.details(uuid),
    finDeCaisse: (agenceId: number, date?: string, userId?: number | null) => service.rapportFinDeCaisse(agenceId, date, userId),
};
