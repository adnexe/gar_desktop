import { recupererVentesAdmin } from '../apiClient';
import { getDb } from '../database/connection';
import { migrer } from '../database/migrate';
import { logger } from '../logger';
import { AgenceRepository } from '../repositories/AgenceRepository';
import { ConfigRepository } from '../repositories/ConfigRepository';
import { UserRepository } from '../repositories/UserRepository';
import { importerRecuperation, type RecoverySection } from './RecoveryImport';
import { VenteController } from '../controllers/VenteController';

export type RecoveryRequest = { section: RecoverySection; date: string; userId: number; password: string };
let enCours = false;

export async function recupererDepuisAdmin(params: RecoveryRequest, sessionValide: () => boolean) {
    if (enCours) throw new Error('Une récupération est déjà en cours sur ce poste.');
    if (!params || !['ticket', 'bagage', 'courrier', 'courrier_international'].includes(params.section)
        || !/^\d{4}-\d{2}-\d{2}$/.test(params.date) || typeof params.password !== 'string' || !params.password) {
        throw new Error('Choisissez une date et confirmez votre mot de passe.');
    }
    const db = getDb();
    migrer(db);
    const users = new UserRepository();
    const acteur = users.gestionnaire(params.userId);
    if (!sessionValide() || acteur?.role !== 'super_admin') throw new Error('Cette récupération est réservée au super administrateur connecté.');
    const agence = new AgenceRepository().actuelle();
    const token = new ConfigRepository().obtenir('api_token');
    if (!agence || !token) throw new Error('Ce poste doit être configuré pour une agence.');
    enCours = true;
    try {
        const snapshot = await recupererVentesAdmin(token, params.section, params.date, acteur.uuid, params.password);
        if (snapshot.section !== params.section || snapshot.date !== params.date) throw new Error('La date ou la section reçue ne correspond pas à la demande.');
        if (!sessionValide() || users.gestionnaire(params.userId)?.role !== 'super_admin' || new AgenceRepository().actuelle()?.uuid !== agence.uuid) {
            throw new Error('Le compte ou la configuration du poste a changé. Recommencez la récupération.');
        }
        let resultat;
        try {
            resultat = importerRecuperation(db, snapshot, agence);
        } catch (error) {
            if (error instanceof Error && error.name === 'Error') throw error;
            logger.warn('Récupération arrêtée : données incompatibles', { section: params.section, date: params.date, erreur: String(error) });
            throw new Error('Les données sauvegardées ne sont pas compatibles avec ce poste. Aucune donnée locale modifiée. Faites vérifier la sauvegarde.');
        }
        logger.info('Récupération admin terminée', { agence_id: agence.id, acteur_id: acteur.id, section: params.section, date: params.date, ...resultat });
        return resultat;
    } finally {
        enCours = false;
    }
}

export function consulterTicketsRecuperes(params: { date: string; userId: number; voyageId?: number | null }) {
    const acteur = new UserRepository().gestionnaire(params.userId);
    const agence = new AgenceRepository().actuelle();
    if (acteur?.role !== 'super_admin' || !agence || !/^\d{4}-\d{2}-\d{2}$/.test(params.date)) throw new Error('Consultation non autorisée.');
    const disponible = Boolean(getDb().prepare(`SELECT 1 FROM tickets t JOIN voyages v ON v.id = t.voyage_id
        WHERE v.agence_depart_id = ? AND date(t.created_at) = date(?) AND t.recupere_admin_at IS NOT NULL LIMIT 1`).get(agence.id, params.date));
    const modeClient = new ConfigRepository().obtenir('reseau_mode') === 'client';
    return {
        disponible, modeClient,
        ventes: disponible && modeClient ? VenteController.ventesDuJour(agence.id, params.date, null) : [],
        rapport: disponible && modeClient ? VenteController.finDeCaisse(agence.id, params.date, null, params.voyageId ?? null) : null,
        voyages: disponible && modeClient ? VenteController.voyagesFinDeCaisse(agence.id, params.date) : [],
    };
}
