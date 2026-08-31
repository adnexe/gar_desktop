import { apiBaseUrl, verifierAdresseAdmin } from '../apiClient';
import { normaliserAdresseAdmin } from '../apiClient/adresse';
import { getDb } from '../database/connection';
import { ConfigRepository } from '../repositories/ConfigRepository';
import { AgenceRepository } from '../repositories/AgenceRepository';
import { UserRepository } from '../repositories/UserRepository';
import { avecVerrouComptes } from './CompteSyncLock';
import { logger } from '../logger';

export async function enregistrerAdresseAdmin(valeur: unknown, userId: number | null, sessionValide: () => boolean): Promise<string> {
    const url = normaliserAdresseAdmin(valeur);
    return avecVerrouComptes(async () => {
        const config = new ConfigRepository();
        const reference = config.obtenir('agence_reference');
        const verifierAcces = () => {
            if (!reference) return;
            const users = new UserRepository();
            if (!userId || !sessionValide() || !users.sessionValide(userId).ok || users.gestionnaire(userId)?.role !== 'super_admin') {
                throw new Error('Connectez-vous avec un compte super administrateur pour modifier l’adresse admin.');
            }
        };
        verifierAcces();
        const ancienneUrl = apiBaseUrl();
        if (!reference || url === ancienneUrl) {
            config.definir('admin_url', url);
            return url;
        }

        const agence = new AgenceRepository().actuelle();
        if (!agence || agence.reference !== reference) throw new Error('Configuration de l’agence introuvable. Aucune adresse modifiée.');
        const resultat = await verifierAdresseAdmin(url, reference);
        verifierAcces();
        const agenceActuelle = new AgenceRepository().actuelle();
        if (config.obtenir('agence_reference') !== reference || agenceActuelle?.uuid !== agence.uuid || apiBaseUrl() !== ancienneUrl) {
            throw new Error('La configuration du poste a changé. Réessayez.');
        }
        if (resultat.agence?.uuid !== agence.uuid || resultat.agence.id !== agence.id
            || resultat.agence.reference !== reference || !resultat.agence.actif
            || typeof resultat.token !== 'string' || !resultat.token.trim()) {
            throw new Error('Cette adresse ne correspond pas à la même agence et à ses données. L’adresse précédente est conservée.');
        }

        // L'adresse et son jeton changent ensemble. Le catalogue, la licence,
        // les ventes et la file de synchronisation restent intacts.
        getDb().transaction(() => {
            config.definir('admin_url', url);
            config.definir('api_token', resultat.token);
        })();
        logger.info('Adresse admin du poste modifiée', { url, acteur_user_id: userId });
        return url;
    });
}
