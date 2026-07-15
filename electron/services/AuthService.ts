import bcrypt from 'bcryptjs';
import { net } from 'electron';
import { logger } from '../logger';
import { UserRepository } from '../repositories/UserRepository';
import { syncEngine } from '../sync/SyncEngine';
import { BootstrapService } from './BootstrapService';

export interface Session {
    userId: number;
    uuid: string;
    nom: string;
    role: string;
    agentId: number | null;
    agenceId: number | null;
    typeAgent: string[];
}

export class AuthService {
    private readonly users = new UserRepository();
    private readonly bootstrap = new BootstrapService();

    async connecter(identifiant: string, motDePasse: string): Promise<Session> {
        let sessionLocale: Session;
        try {
            sessionLocale = await this.authentifierLocal(identifiant, motDePasse);
        } catch (erreur) {
            if (!net.isOnline()) {
                throw erreur;
            }

            try {
                await this.bootstrap.actualiser(5000);
                const sessionApresActualisation = await this.authentifierLocal(identifiant, motDePasse);
                syncEngine.planifier(1_000);

                return sessionApresActualisation;
            } catch {
                logger.warn('Actualisation avant connexion échouée ou identifiants toujours invalides.');
                syncEngine.planifier(1_000);
                throw erreur;
            }
        }

        if (!net.isOnline()) {
            return sessionLocale;
        }

        try {
            await this.bootstrap.actualiser(5000);
        } catch {
            logger.warn('Actualisation ignorée pendant la connexion : serveur injoignable.');
            syncEngine.planifier(1_000);
            return sessionLocale;
        }

        // Après synchronisation, on relit l'utilisateur local : modules,
        // activation ou mot de passe peuvent avoir changé côté admin.
        const sessionAJour = await this.authentifierLocal(identifiant, motDePasse);
        syncEngine.planifier(1_000);

        return sessionAJour;
    }

    private async authentifierLocal(identifiant: string, motDePasse: string): Promise<Session> {
        const utilisateur = this.users.parIdentifiant(identifiant);
        if (!utilisateur) {
            throw new Error('IDENTIFIANTS_INVALIDES');
        }

        const motDePasseValide = await bcrypt.compare(motDePasse, utilisateur.password);
        if (!motDePasseValide) {
            throw new Error('IDENTIFIANTS_INVALIDES');
        }

        return {
            userId: utilisateur.id,
            uuid: utilisateur.uuid,
            nom: utilisateur.name ?? utilisateur.agent_nom ?? utilisateur.number ?? utilisateur.email ?? 'Utilisateur',
            role: utilisateur.role,
            agentId: utilisateur.agent_id,
            agenceId: utilisateur.agence_id,
            typeAgent: utilisateur.type_agent ? utilisateur.type_agent.split(',') : [],
        };
    }
}
