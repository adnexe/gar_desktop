import { getDb } from '../database/connection';
import { migrer } from '../database/migrate';
import { UserRepository } from '../repositories/UserRepository';
import { SyncQueueRepository } from '../repositories/SyncQueueRepository';
import { queueManager } from '../sync/QueueManager';

export class AgentService {
    private readonly users = new UserRepository();
    private readonly syncQueue = new SyncQueueRepository();

    lister(agenceId: number) {
        migrer(getDb());

        return this.users.listerAgentsAgence(agenceId);
    }

    desactiver(agentUuid: string, acteurUserId: number) {
        migrer(getDb());

        const cible = this.assertPeutGerer(agentUuid, acteurUserId, false);
        if (!cible.user_id) {
            throw new Error('ACCES_INTROUVABLE');
        }
        const cibleApres = this.users.modifierStatutLocal(cible.uuid, false) ?? cible;

        this.empilerAction(cibleApres, 'desactiver');

        return { ok: true };
    }

    reactiver(agentUuid: string, acteurUserId: number) {
        migrer(getDb());

        const cible = this.assertPeutGerer(agentUuid, acteurUserId, false);
        if (!cible.user_id) {
            throw new Error('ACCES_INTROUVABLE');
        }
        this.syncQueue.annulerEnAttente('users', [cible.user_uuid ?? '', cible.uuid], 'Action annulée par réactivation locale.');
        this.users.modifierStatutLocal(cible.uuid, true);

        return { ok: true };
    }

    supprimerLocalement(agentUuid: string, acteurUserId: number) {
        migrer(getDb());

        const cible = this.assertPeutGerer(agentUuid, acteurUserId, true);
        if (!cible.user_id) {
            throw new Error('ACCES_INTROUVABLE');
        }
        const cibleApres = this.users.supprimerLocalement(cible.uuid) ?? cible;

        this.empilerAction(cibleApres, 'supprimer_local');

        return { ok: true };
    }

    verifierSession(userId: number) {
        migrer(getDb());

        return this.users.sessionValide(userId);
    }

    private assertPeutGerer(agentUuid: string, acteurUserId: number, suppression: boolean) {
        const acteur = this.users.gestionnaire(acteurUserId);
        if (!acteur || !['chef_gare', 'super_admin'].includes(acteur.role)) {
            throw new Error('ACTION_NON_AUTORISEE');
        }

        if (suppression && acteur.role !== 'super_admin') {
            throw new Error('SUPPRESSION_RESERVEE_SUPER_ADMIN');
        }

        const cible = this.users.cibleParUuid(agentUuid);
        if (!cible || cible.supprime_localement === 1) {
            throw new Error('AGENT_INTROUVABLE');
        }

        if (cible.user_id === acteurUserId) {
            throw new Error('ACTION_SUR_SOI_INTERDITE');
        }

        if (acteur.role === 'chef_gare' && acteur.agence_id !== cible.agence_id) {
            throw new Error('AGENT_HORS_AGENCE');
        }

        return cible;
    }

    private empilerAction(
        cible: {
            uuid: string;
            user_uuid: string | null;
        },
        action: 'desactiver' | 'supprimer_local',
    ) {
        queueManager.ajouter(
            'users',
            cible.user_uuid ?? cible.uuid,
            {
                action,
                agent_uuid: cible.uuid,
                user_uuid: cible.user_uuid,
                actif: false,
                updated_at: new Date().toISOString(),
            },
            'update',
        );
    }
}
