import { getDb } from '../database/connection';
import { migrer } from '../database/migrate';
import {
    LotRepository,
    type CreerLotDonnees,
    type RetirerElementsLotDonnees,
    type StatutLot,
    type TypeLot,
} from '../repositories/LotRepository';

export class LotService {
    private readonly lots = new LotRepository();

    lister(agenceId: number, type: TypeLot, date: string, userId: number) {
        migrer(getDb());
        const filtreUserId = this.verifierAcces(userId, agenceId, type);
        return this.lots.lister(agenceId, type, date, filtreUserId);
    }

    eligibles(agenceId: number, type: TypeLot, date: string, userId: number) {
        migrer(getDb());
        const filtreUserId = this.verifierAcces(userId, agenceId, type);
        return this.lots.eligibles(agenceId, type, date, filtreUserId);
    }

    creer(donnees: CreerLotDonnees) {
        migrer(getDb());
        const filtreUserId = this.verifierAcces(donnees.userId, donnees.agenceId, donnees.type);
        return this.lots.creer(donnees, filtreUserId);
    }

    details(uuid: string, userId: number) {
        migrer(getDb());
        const contexte = this.lots.contexte(uuid);
        if (!contexte) throw new Error('LOT_INTROUVABLE');
        const filtreUserId = this.verifierAcces(userId, contexte.agence_id, contexte.type);
        if (filtreUserId !== null && contexte.cree_par_user_id !== userId) throw new Error('COMPTE_NON_AUTORISE_LOT');
        return this.lots.details(uuid);
    }

    changerStatut(uuid: string, statut: StatutLot, userId: number) {
        migrer(getDb());
        const contexte = this.lots.contexte(uuid);
        if (!contexte) throw new Error('LOT_INTROUVABLE');
        const filtreUserId = this.verifierAcces(userId, contexte.agence_id, contexte.type);
        if (filtreUserId !== null && contexte.cree_par_user_id !== userId) throw new Error('COMPTE_NON_AUTORISE_LOT');
        return this.lots.changerStatut(uuid, statut);
    }

    retirerElements(donnees: RetirerElementsLotDonnees) {
        migrer(getDb());
        const contexte = this.lots.contexte(donnees.uuid);
        if (!contexte) throw new Error('LOT_INTROUVABLE');
        const filtreUserId = this.verifierAcces(donnees.userId, contexte.agence_id, contexte.type);
        if (filtreUserId !== null && contexte.cree_par_user_id !== donnees.userId) {
            throw new Error('COMPTE_NON_AUTORISE_LOT');
        }
        return this.lots.retirerElements(donnees.uuid, donnees.elementUuids);
    }

    private verifierAcces(userId: number, agenceId: number, type: TypeLot): number | null {
        const utilisateur = getDb().prepare(
            `SELECT u.role, u.agent_id, a.agence_id, a.type_agent, a.actif AS agent_actif,
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
            agence_id: number | null;
            type_agent: string | null;
            agent_actif: number | null;
            agent_desactive_localement: number | null;
            agent_supprime_localement: number | null;
            agence_active: number | null;
        } | undefined;

        if (!utilisateur) throw new Error('COMPTE_NON_AUTORISE_LOT');
        const module = type === 'courrier'
            ? 'courrier'
            : type === 'courrier_international' ? 'courrier_international' : 'bagage';
        const roleGlobal = ['super_admin', 'admin'].includes(utilisateur.role);
        const chef = utilisateur.role === 'chef_gare';
        const moduleAutorise = (utilisateur.type_agent ?? '').split(',').filter(Boolean).includes(module);
        if (!roleGlobal && !chef && !moduleAutorise) throw new Error('COMPTE_NON_AUTORISE_LOT');

        if (utilisateur.agent_id !== null) {
            if (utilisateur.agence_id !== agenceId || utilisateur.agent_actif !== 1 || utilisateur.agence_active !== 1
                || utilisateur.agent_desactive_localement === 1 || utilisateur.agent_supprime_localement === 1) {
                throw new Error('COMPTE_NON_AUTORISE_LOT');
            }
        }

        return roleGlobal || chef ? null : userId;
    }
}
