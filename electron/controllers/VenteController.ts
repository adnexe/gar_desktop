import { VenteService, type DemandeVente, type RechercheVoyages } from '../services/VenteService';

const service = new VenteService();

export const VenteController = {
    rechercherVoyages: (params: RechercheVoyages) => service.rechercherVoyages(params),
    rechercherClient: (telephone: string) => service.rechercherClient(telephone),
    exporterClientPourClient: (telephone: string) => service.exporterClientPourClient(telephone),
    exporterTicketPourClient: (code: string) => service.exporterTicketPourClient(code),
    exporterTicketsPourClient: (agenceId: number, date?: string | null) => service.exporterTicketsPourClient(agenceId, date),
    preparerNumero: () => service.preparerNumero(),
    vendre: (demande: DemandeVente) => {
        try {
            return { ok: true as const, ticket: service.vendre(demande) };
        } catch (erreur) {
            if (erreur instanceof Error && erreur.message === 'PLACE_DEJA_VENDUE') {
                return { ok: false as const, erreur: 'Cette place vient d\'être vendue, choisissez-en une autre.' };
            }
            if (erreur instanceof Error && erreur.message === 'TARIF_NON_CONFIGURE') {
                return { ok: false as const, erreur: 'Ce tarif n\'est pas configuré pour cette agence.' };
            }
            if (erreur instanceof Error && erreur.message === 'COMPTE_NON_AUTORISE_TICKET') {
                return { ok: false as const, erreur: "Ce compte n'est pas autorisé à vendre des tickets." };
            }
            throw erreur;
        }
    },
    confirmerImpression: (uuid: string) => {
        const ok = service.confirmerImpression(uuid);

        return ok
            ? { ok: true as const }
            : { ok: false as const, erreur: "Le ticket n'est plus en attente d'impression." };
    },
    annulerImpression: (uuid: string, motif: string) => {
        service.annulerImpression(uuid, motif);

        return { ok: true as const };
    },
    ventesDuJour: (agenceId: number, date?: string, userId?: number | null) => service.ventesDuJour(agenceId, date, userId),
    finDeCaisse: (agenceId: number, date?: string, userId?: number | null) => service.rapportFinDeCaisse(agenceId, date, userId),
};
