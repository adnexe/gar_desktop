import bcrypt from 'bcryptjs';
import { net } from 'electron';
import { modifierMotDePasseAdmin } from '../apiClient';
import { AgenceRepository } from '../repositories/AgenceRepository';
import { ConfigRepository } from '../repositories/ConfigRepository';
import { UserRepository } from '../repositories/UserRepository';
import { logger } from '../logger';
import { avecVerrouComptes } from './CompteSyncLock';

export type ModificationMotDePasse = { currentPassword: string; password: string; confirmation: string };
let enCours = false;

export function profilConnecte(userId: number | null) {
    const users = new UserRepository();
    if (!userId || !users.sessionValide(userId).ok) throw new Error('Reconnectez-vous pour accéder à votre profil.');
    const profil = users.profil(userId);
    if (!profil) throw new Error('Votre compte est introuvable sur ce poste.');
    return profil;
}

export async function modifierMotDePasse(userId: number | null, params: ModificationMotDePasse, sessionValide: () => boolean) {
    if (enCours) throw new Error('Un changement de mot de passe est déjà en cours.');
    if (!params || typeof params.currentPassword !== 'string' || !params.currentPassword || params.currentPassword.length > 255
        || typeof params.password !== 'string' || Array.from(params.password).length < 8
        || Buffer.byteLength(params.password, 'utf8') > 72 || params.password.includes('\0')
        || params.password !== params.confirmation || params.password === params.currentPassword) {
        throw new Error('Renseignez votre mot de passe actuel et confirmez un nouveau mot de passe différent, de 8 caractères minimum (72 octets maximum).');
    }
    if (!sessionValide()) throw new Error('Reconnectez-vous avant de modifier votre mot de passe.');
    const profil = profilConnecte(userId);
    if (!net.isOnline()) throw new Error('Connectez cet ordinateur à Internet pour modifier votre mot de passe.');
    enCours = true;
    // Copie interne : aucune mise en file de synchronisation ni stockage du secret.
    const demande = { ...params };
    try {
        return await avecVerrouComptes(async () => {
            if (!sessionValide() || profilConnecte(userId).uuid !== profil.uuid) throw new Error('Votre session a changé. Reconnectez-vous.');
            if (!net.isOnline()) throw new Error('Connectez cet ordinateur à Internet pour modifier votre mot de passe.');
            const agence = new AgenceRepository().actuelle();
            const token = new ConfigRepository().obtenir('api_token');
            if (!agence || !token) throw new Error('Actualisez la connexion avec admin depuis les paramètres.');
            const hash = await bcrypt.hash(demande.password, 12);
            if (!sessionValide()) throw new Error('Votre session a changé. Reconnectez-vous.');
            const resultat = await modifierMotDePasseAdmin(token, profil.uuid, demande.currentPassword, demande.password, demande.confirmation);
            try {
                if (resultat?.uuid !== profil.uuid || typeof resultat.updated_at !== 'string' || !Number.isFinite(Date.parse(resultat.updated_at))
                    || new AgenceRepository().actuelle()?.uuid !== agence.uuid) throw new Error('CONTEXTE_MODIFIE');
                // Meme si l'utilisateur s'est deconnecte pendant la requete,
                // on applique l'acquittement au compte d'origine, jamais au suivant.
                new UserRepository().modifierMotDePasseConfirme(userId!, profil.uuid, hash, resultat.updated_at);
            } catch {
                logger.warn('Mot de passe confirmé par admin, mise à jour locale à reprendre', { user_uuid: profil.uuid });
                throw new Error('Le mot de passe a été modifié dans admin, mais ce poste n’a pas pu être mis à jour. Reconnectez-vous avec Internet et le nouveau mot de passe.');
            }
            logger.info('Mot de passe mis à jour sur admin et sur ce poste', { user_uuid: profil.uuid });
            return { ok: true as const };
        });
    } finally {
        demande.currentPassword = '';
        demande.password = '';
        demande.confirmation = '';
        enCours = false;
    }
}
