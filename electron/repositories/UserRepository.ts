import { getDb } from '../database/connection';

export interface UtilisateurLocal {
    id: number;
    uuid: string;
    name: string | null;
    email: string | null;
    number: string | null;
    password: string;
    role: string;
    agent_id: number | null;
    agence_id: number | null;
    agent_nom: string | null;
    type_agent: string | null;
}

export interface AgentCompteLocal {
    id: number;
    uuid: string;
    nom: string;
    telephone: string | null;
    role: string;
    type_agent: string[];
    actif: boolean;
    desactive_localement: boolean;
    user_id: number | null;
    user_uuid: string | null;
    user_email: string | null;
    user_number: string | null;
    user_actif: boolean | null;
    user_desactive_localement: boolean | null;
}

type GestionnaireLocal = {
    id: number;
    uuid: string;
    role: string;
    agent_id: number | null;
    agence_id: number | null;
};

type CibleAgent = {
    id: number;
    uuid: string;
    agence_id: number;
    actif: number;
    desactive_localement: number;
    supprime_localement: number;
    user_id: number | null;
    user_uuid: string | null;
    user_actif: number | null;
    user_desactive_localement: number | null;
    user_supprime_localement: number | null;
};

export class UserRepository {
    parIdentifiant(identifiant: string): UtilisateurLocal | null {
        const ligne = getDb()
            .prepare(
                `SELECT u.id, u.uuid, u.name, u.email, u.number, u.password, u.role,
                        u.agent_id, ag.agence_id, ag.nom AS agent_nom, ag.type_agent
                 FROM users u
                 LEFT JOIN agents ag ON ag.id = u.agent_id
                 LEFT JOIN agences agence ON agence.id = ag.agence_id
                 WHERE (u.number = ? OR lower(u.email) = lower(?))
                   AND u.actif = 1
                   AND COALESCE(u.desactive_localement, 0) = 0
                   AND COALESCE(u.supprime_localement, 0) = 0
                   AND (
                        u.agent_id IS NULL
                        OR (
                            ag.actif = 1
                            AND COALESCE(ag.desactive_localement, 0) = 0
                            AND COALESCE(ag.supprime_localement, 0) = 0
                            AND COALESCE(agence.actif, 1) = 1
                        )
                   )
                 LIMIT 1`,
            )
            .get(identifiant, identifiant) as UtilisateurLocal | undefined;

        return ligne ?? null;
    }

    listerAgentsAgence(agenceId: number): AgentCompteLocal[] {
        const lignes = getDb()
            .prepare(
                `SELECT a.id, a.uuid, a.nom, a.telephone, a.role, a.type_agent,
                        a.actif, COALESCE(a.desactive_localement, 0) AS desactive_localement,
                        u.id AS user_id, u.uuid AS user_uuid, u.email AS user_email, u.number AS user_number,
                        u.actif AS user_actif, COALESCE(u.desactive_localement, 0) AS user_desactive_localement
                 FROM agents a
                 LEFT JOIN users u ON u.agent_id = a.id AND COALESCE(u.supprime_localement, 0) = 0
                 WHERE a.agence_id = ?
                   AND COALESCE(a.supprime_localement, 0) = 0
                 ORDER BY a.nom COLLATE NOCASE ASC`,
            )
            .all(agenceId) as Array<{
                id: number;
                uuid: string;
                nom: string;
                telephone: string | null;
                role: string;
                type_agent: string | null;
                actif: number;
                desactive_localement: number;
                user_id: number | null;
                user_uuid: string | null;
                user_email: string | null;
                user_number: string | null;
                user_actif: number | null;
                user_desactive_localement: number | null;
            }>;

        return lignes.map((ligne) => ({
            id: ligne.id,
            uuid: ligne.uuid,
            nom: ligne.nom,
            telephone: ligne.telephone,
            role: ligne.role,
            type_agent: ligne.type_agent ? ligne.type_agent.split(',').filter(Boolean) : [],
            actif: ligne.actif === 1,
            desactive_localement: ligne.desactive_localement === 1 || ligne.user_desactive_localement === 1,
            user_id: ligne.user_id,
            user_uuid: ligne.user_uuid,
            user_email: ligne.user_email,
            user_number: ligne.user_number,
            user_actif: ligne.user_actif === null ? null : ligne.user_actif === 1,
            user_desactive_localement: ligne.user_desactive_localement === null ? null : ligne.user_desactive_localement === 1,
        }));
    }

    gestionnaire(userId: number): GestionnaireLocal | null {
        return (getDb()
            .prepare(
                `SELECT u.id, u.uuid, u.role, u.agent_id, ag.agence_id
                 FROM users u
                 LEFT JOIN agents ag ON ag.id = u.agent_id
                 WHERE u.id = ?
                   AND u.actif = 1
                   AND COALESCE(u.supprime_localement, 0) = 0`,
            )
            .get(userId) as GestionnaireLocal | undefined) ?? null;
    }

    cibleParUuid(agentUuid: string): CibleAgent | null {
        return (getDb()
            .prepare(
                `SELECT a.id, a.uuid, a.agence_id, a.actif,
                        COALESCE(a.desactive_localement, 0) AS desactive_localement,
                        COALESCE(a.supprime_localement, 0) AS supprime_localement,
                        u.id AS user_id, u.uuid AS user_uuid, u.actif AS user_actif,
                        COALESCE(u.desactive_localement, 0) AS user_desactive_localement,
                        COALESCE(u.supprime_localement, 0) AS user_supprime_localement
                 FROM agents a
                 LEFT JOIN users u ON u.agent_id = a.id AND COALESCE(u.supprime_localement, 0) = 0
                 WHERE a.uuid = ?
                 LIMIT 1`,
            )
            .get(agentUuid) as CibleAgent | undefined) ?? null;
    }

    sessionValide(userId: number): { ok: true } | { ok: false; raison: string } {
        const ligne = getDb()
            .prepare(
                `SELECT u.actif AS user_actif,
                        COALESCE(u.desactive_localement, 0) AS user_desactive_localement,
                        COALESCE(u.supprime_localement, 0) AS user_supprime_localement,
                        u.agent_id,
                        ag.actif AS agent_actif,
                        COALESCE(ag.desactive_localement, 0) AS agent_desactive_localement,
                        COALESCE(ag.supprime_localement, 0) AS agent_supprime_localement,
                        agence.actif AS agence_actif
                 FROM users u
                 LEFT JOIN agents ag ON ag.id = u.agent_id
                 LEFT JOIN agences agence ON agence.id = ag.agence_id
                 WHERE u.id = ?
                 LIMIT 1`,
            )
            .get(userId) as
            | {
                  user_actif: number;
                  user_desactive_localement: number;
                  user_supprime_localement: number;
                  agent_id: number | null;
                  agent_actif: number | null;
                  agent_desactive_localement: number | null;
                  agent_supprime_localement: number | null;
                  agence_actif: number | null;
              }
            | undefined;

        if (!ligne) return { ok: false, raison: 'COMPTE_INEXISTANT' };
        if (ligne.user_actif !== 1 || ligne.user_desactive_localement === 1 || ligne.user_supprime_localement === 1) {
            return { ok: false, raison: 'COMPTE_DESACTIVE' };
        }

        if (ligne.agent_id !== null) {
            if (ligne.agent_actif !== 1 || ligne.agent_desactive_localement === 1 || ligne.agent_supprime_localement === 1) {
                return { ok: false, raison: 'AGENT_DESACTIVE' };
            }

            if (ligne.agence_actif !== null && ligne.agence_actif !== 1) {
                return { ok: false, raison: 'AGENCE_DESACTIVEE' };
            }
        }

        return { ok: true };
    }

    modifierStatutLocal(agentUuid: string, actif: boolean): CibleAgent | null {
        const cible = this.cibleParUuid(agentUuid);
        if (!cible) return null;

        const maintenant = new Date().toISOString();
        if (cible.user_id) {
            getDb()
                .prepare(
                    `UPDATE users
                     SET actif = ?, desactive_localement = ?, updated_at = ?
                     WHERE id = ?`,
                )
                .run(actif ? 1 : 0, actif ? 0 : 1, maintenant, cible.user_id);
        }

        return this.cibleParUuid(agentUuid);
    }

    supprimerLocalement(agentUuid: string): CibleAgent | null {
        const cible = this.cibleParUuid(agentUuid);
        if (!cible) return null;

        const maintenant = new Date().toISOString();
        if (cible.user_id) {
            getDb()
                .prepare(
                    `UPDATE users
                     SET actif = 0, desactive_localement = 1, supprime_localement = 1, updated_at = ?
                     WHERE id = ?`,
                )
                .run(maintenant, cible.user_id);
        }

        return cible;
    }

    marquerActionSynchronisee(payload: Record<string, unknown>): void {
        const agentUuid = typeof payload.agent_uuid === 'string' ? payload.agent_uuid : null;
        const userUuid = typeof payload.user_uuid === 'string' ? payload.user_uuid : null;
        if (!agentUuid && !userUuid) return;

        if (payload.action === 'desactiver') {
            if (userUuid) {
                getDb().prepare('UPDATE users SET desactive_localement = 0 WHERE uuid = ?').run(userUuid);
            }
        }
    }
}
