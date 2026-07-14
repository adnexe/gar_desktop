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

export class UserRepository {
    parIdentifiant(identifiant: string): UtilisateurLocal | null {
        const ligne = getDb()
            .prepare(
                `SELECT u.id, u.uuid, u.name, u.email, u.number, u.password, u.role,
                        u.agent_id, ag.agence_id, ag.nom AS agent_nom, ag.type_agent
                 FROM users u
                 LEFT JOIN agents ag ON ag.id = u.agent_id
                 WHERE (u.number = ? OR lower(u.email) = lower(?)) AND u.actif = 1
                 LIMIT 1`,
            )
            .get(identifiant, identifiant) as UtilisateurLocal | undefined;

        return ligne ?? null;
    }
}
