import { ConvoiService } from '../services/ConvoiService';
import type { NouveauConvoi } from '../repositories/ConvoiRepository';
import { messageErreurNumerotation } from './NumeroOperationError';

const service = new ConvoiService();
const messages: Record<string, string> = {
    COMPTE_CONVOI_NON_AUTORISE: "Ce compte n'est pas autorisé à consulter les convois de cette agence.",
    CREATION_CONVOI_CAISSIERE_UNIQUEMENT: 'Seule une caissière affectée aux tickets peut créer un convoi sur ce poste.',
    DATE_CONVOI_PASSEE: 'La date de départ du convoi ne peut pas être passée.',
    PRECISION_DESTINATION_REQUISE: 'Précisez le village, le quartier ou le lieu exact.',
    NOMBRE_PLACES_INVALIDE: 'Le nombre de places doit être compris entre 1 et 200.',
    MONTANT_CONVOI_INVALIDE: 'Le montant fixé est invalide.',
    DATE_RETOUR_INVALIDE: 'La date de retour ne peut pas précéder le départ.',
};

function reponse<T>(operation: () => T) {
    try { return { ok: true as const, data: operation() }; }
    catch (erreur) {
        const erreurNumerotation = messageErreurNumerotation(erreur);
        if (erreurNumerotation) return { ok: false as const, erreur: erreurNumerotation };
        const code = erreur instanceof Error ? erreur.message : '';
        return { ok: false as const, erreur: messages[code] ?? (code || "L'opération sur le convoi a échoué.") };
    }
}

export const ConvoiController = {
    liste: (agenceId: number, date: string, userId: number) => reponse(() => service.liste(agenceId, date, userId)),
    creer: (donnees: NouveauConvoi) => reponse(() => service.creer(donnees)),
};
