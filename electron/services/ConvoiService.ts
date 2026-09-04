import { getDb } from '../database/connection';
import { migrer } from '../database/migrate';
import { ConvoiRepository, type NouveauConvoi } from '../repositories/ConvoiRepository';
import { dateCaisseDuJour } from '../database/dates';

export class ConvoiService {
    private readonly convois = new ConvoiRepository();

    liste(agenceId: number, date: string, userId: number) {
        migrer(getDb());
        this.verifierCompte(userId, agenceId, false);
        return this.convois.lister(agenceId, date);
    }

    creer(donnees: NouveauConvoi) {
        migrer(getDb());
        this.verifierCompte(donnees.userId, donnees.agenceId, true);
        const aujourdHui = dateCaisseDuJour();
        if (donnees.dateDepart < aujourdHui) throw new Error('DATE_CONVOI_PASSEE');
        if (!donnees.precisionDestination.trim()) throw new Error('PRECISION_DESTINATION_REQUISE');
        if (!Number.isInteger(donnees.nombrePlaces) || donnees.nombrePlaces < 1 || donnees.nombrePlaces > 200) throw new Error('NOMBRE_PLACES_INVALIDE');
        if (!Number.isFinite(donnees.montantFixe) || donnees.montantFixe < 0) throw new Error('MONTANT_CONVOI_INVALIDE');
        if (!donnees.dateRetour || donnees.dateRetour < donnees.dateDepart) throw new Error('DATE_RETOUR_INVALIDE');
        return this.convois.creer(donnees);
    }

    private verifierCompte(userId: number, agenceId: number, creation: boolean): void {
        const utilisateur = getDb().prepare(
            `SELECT u.role, u.agent_id, a.role AS agent_role, a.agence_id, a.type_agent,
                    a.actif AS agent_actif,
                    COALESCE(a.desactive_localement, 0) AS agent_desactive_localement,
                    COALESCE(a.supprime_localement, 0) AS agent_supprime_localement,
                    ag.actif AS agence_active
             FROM users u
             LEFT JOIN agents a ON a.id = u.agent_id
             LEFT JOIN agences ag ON ag.id = a.agence_id
             WHERE u.id = ? AND u.actif = 1
               AND COALESCE(u.desactive_localement, 0) = 0
               AND COALESCE(u.supprime_localement, 0) = 0
             LIMIT 1`,
        ).get(userId) as {
            role: string;
            agent_id: number | null;
            agent_role: string | null;
            agence_id: number | null;
            type_agent: string | null;
            agent_actif: number | null;
            agent_desactive_localement: number;
            agent_supprime_localement: number;
            agence_active: number | null;
        } | undefined;
        if (!utilisateur) throw new Error('COMPTE_CONVOI_NON_AUTORISE');

        if (utilisateur.role === 'super_admin') return;
        if (utilisateur.agent_id === null || utilisateur.agence_id !== agenceId || utilisateur.agent_actif !== 1
            || utilisateur.agent_desactive_localement === 1 || utilisateur.agent_supprime_localement === 1
            || utilisateur.agence_active !== 1) {
            throw new Error('COMPTE_CONVOI_NON_AUTORISE');
        }
        if (creation && (utilisateur.agent_role !== 'caissiere' || !(utilisateur.type_agent ?? '').split(',').includes('ticket'))) {
            throw new Error('CREATION_CONVOI_CAISSIERE_UNIQUEMENT');
        }
    }
}
