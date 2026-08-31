import { LotService } from '../services/LotService';
import type {
    CreerLotDonnees,
    RetirerElementsLotDonnees,
    StatutLot,
    TypeLot,
} from '../repositories/LotRepository';

const service = new LotService();

function messageErreur(erreur: unknown): string {
    const code = erreur instanceof Error ? erreur.message : '';
    const messages: Record<string, string> = {
        COMPTE_NON_AUTORISE_LOT: "Ce compte n'est pas autorisé à gérer ces lots.",
        SELECTION_LOT_INVALIDE: 'Sélectionnez au moins un élément pour créer le lot.',
        ELEMENT_LOT_INDISPONIBLE: 'Un élément sélectionné est introuvable ou appartient déjà à un lot.',
        LOT_DESTINATION_VOYAGE_UNIQUE: 'Un lot doit contenir une seule destination et, si nécessaire, un seul voyage.',
        LOT_INTROUVABLE: 'Ce lot est introuvable.',
        TRANSITION_LOT_INVALIDE: "Ce changement de statut n'est pas autorisé.",
        SELECTION_RETRAIT_LOT_INVALIDE: 'Sélectionnez au moins un élément à retirer du lot.',
        ELEMENT_RETRAIT_LOT_INDISPONIBLE: "Un élément sélectionné n'appartient plus à ce lot.",
        LOT_DOIT_GARDER_UN_ELEMENT: 'Un lot doit conserver au moins un élément.',
        LOT_DEJA_EXPEDIE_MODIFICATION_INTERDITE: "Un lot expédié ne peut plus être modifié.",
    };
    return messages[code] ?? (code || "L'opération sur le lot a échoué.");
}

function reponse<T>(operation: () => T) {
    try {
        return { ok: true as const, data: operation() };
    } catch (erreur) {
        return { ok: false as const, erreur: messageErreur(erreur) };
    }
}

export const LotController = {
    lister: (params: { agenceId: number; type: TypeLot; date: string; userId: number }) =>
        reponse(() => service.lister(params.agenceId, params.type, params.date, params.userId)),
    eligibles: (params: { agenceId: number; type: TypeLot; date: string; userId: number }) =>
        reponse(() => service.eligibles(params.agenceId, params.type, params.date, params.userId)),
    creer: (params: CreerLotDonnees) => reponse(() => service.creer(params)),
    details: (uuid: string, userId: number) => reponse(() => service.details(uuid, userId)),
    changerStatut: (uuid: string, statut: StatutLot, userId: number) =>
        reponse(() => service.changerStatut(uuid, statut, userId)),
    retirerElements: (params: RetirerElementsLotDonnees) => reponse(() => service.retirerElements(params)),
};
