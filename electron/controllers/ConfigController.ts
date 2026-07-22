import axios from 'axios';
import type Database from 'better-sqlite3';
import { apiBaseUrl } from '../apiClient';
import { getDb } from '../database/connection';
import { migrer } from '../database/migrate';
import { logger } from '../logger';
import { BootstrapService } from '../services/BootstrapService';
import { localNetworkService, type ModeReseauLocal } from '../services/LocalNetworkService';
import { UserRepository } from '../repositories/UserRepository';
import { SyncQueueRepository } from '../repositories/SyncQueueRepository';
import { syncEngine } from '../sync/SyncEngine';

const service = new BootstrapService();
const users = new UserRepository();
const fileSync = new SyncQueueRepository();

function messageErreurActualisation(erreur: unknown): string {
    if (axios.isAxiosError(erreur)) {
        const status = erreur.response?.status;
        if (status === 429) {
            return "Trop d'actualisations en peu de temps. Réessayez dans une minute.";
        }

        if (status === 404) {
            return "L'agence n'a pas été trouvée ou elle est désactivée côté admin.";
        }

        if (status === 401 || status === 403) {
            return "L'accès à admin n'est pas autorisé. Relancez la configuration si le problème continue.";
        }

        if (status && status >= 500) {
            return "Admin rencontre une erreur. Réessayez dans quelques instants.";
        }

        if (erreur.code === 'ECONNREFUSED') {
            return "Admin n'est pas disponible. Vérifiez qu'il est lancé, puis réessayez.";
        }
        if (erreur.code === 'ECONNABORTED' || erreur.code === 'ETIMEDOUT') {
            return "Admin met trop de temps à répondre. Réessayez dans quelques instants.";
        }
        if (erreur.code === 'ENOTFOUND' || erreur.code === 'EAI_AGAIN') {
            return "Adresse admin introuvable. Vérifiez la connexion internet ou la configuration.";
        }

        return "Impossible d'actualiser depuis admin. Les données locales restent disponibles.";
    }

    return "Impossible d'actualiser depuis admin. Les données locales restent disponibles.";
}

function tableExiste(db: Database.Database, nom: string): boolean {
    const ligne = db
        .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`)
        .get(nom) as { name: string } | undefined;

    return Boolean(ligne);
}

function verifierSuperAdmin(acteurUserId?: number | null): void {
    const acteur = acteurUserId ? users.gestionnaire(acteurUserId) : null;
    if (acteur?.role !== 'super_admin') {
        throw new Error('Seul un super admin peut effectuer cette action.');
    }
}

export const ConfigController = {
    estConfiguree: () => service.estConfiguree(),
    agenceActuelle: () => service.agenceActuelle(),
    compagnieActuelle: () => service.compagnieActuelle(),
    licenceActuelle: () => service.licenceActuelle(),
    reclamerLicence: (reference: string, appareil: string, codePoste?: string | null) => service.reclamerLicence(reference, appareil, codePoste),
    verifierLicence: async () => {
        await service.verifierLicenceEnLigne();
        return service.licenceActuelle();
    },
    configurer: (reference: string, appareil: string, codePoste?: string | null) => service.configurer(reference, appareil, codePoste),
    actualiser: async () => {
        try {
            return { ok: true as const, agence: await service.actualiser(), baseUrl: apiBaseUrl() };
        } catch (erreur) {
            // Hors-ligne ou serveur injoignable : l'app continue avec les
            // données locales, on signale juste l'échec à l'interface.
            return { ok: false as const, erreur: messageErreurActualisation(erreur), baseUrl: apiBaseUrl() };
        }
    },
    // Force un cycle de synchro vers admin tout de suite (au lieu d'attendre
    // le déclenchement automatique) — utile après une coupure réseau ou pour
    // vérifier que la file n'est pas bloquée sur un élément en erreur.
    synchroniserMaintenant: async () => {
        await syncEngine.runCycle();

        return {
            ok: true as const,
            enAttente: fileSync.compterEnAttente(),
            erreur: fileSync.premiereErreurEnAttente(),
        };
    },
    reseauLocal: () => localNetworkService.configuration(),
    relancerServeurLocal: () => localNetworkService.relancerServeurDepuisConfig(),
    configurerReseauLocal: (params: { mode: ModeReseauLocal; serveurUrl?: string | null; port?: number | null; secret?: string | null; acteurUserId?: number | null }) => {
        verifierSuperAdmin(params.acteurUserId);

        return localNetworkService.configurer(params);
    },
    testerReseauLocal: (serveurUrl: string, secret: string) => localNetworkService.testerClient(serveurUrl, secret),
    actualiserVoyagesServeurLocal: (agenceId: number, date?: string | null) => localNetworkService.actualiserVoyagesDepuisServeur(agenceId, date),
    nettoyerDonneesTest: (acteurUserId?: number | null) => {
        verifierSuperAdmin(acteurUserId);

        const db = getDb();
        migrer(db);

        const tablesOperations = ['colis', 'bagages', 'courriers', 'tickets', 'clients', 'voyages', 'sync_queue'];
        const suppressions: Record<string, number> = {};

        db.pragma('foreign_keys = OFF');
        try {
            db.transaction(() => {
                for (const table of tablesOperations) {
                    if (!tableExiste(db, table)) continue;

                    const resultat = db.prepare(`DELETE FROM ${table}`).run();
                    suppressions[table] = resultat.changes;
                }

                db.prepare(
                    `DELETE FROM config
                      WHERE cle LIKE 'ticket_sequence_%'
                         OR cle LIKE 'bagage_sequence_%'
                         OR cle LIKE 'courrier_sequence_%'`,
                ).run();

                if (tableExiste(db, 'sqlite_sequence')) {
                    db.prepare(
                        `DELETE FROM sqlite_sequence
                          WHERE name IN ('voyages', 'clients', 'tickets', 'bagages', 'courriers', 'colis', 'sync_queue')`,
                    ).run();
                }
            })();
        } finally {
            db.pragma('foreign_keys = ON');
        }

        logger.info('Données de test nettoyées sur la machine locale', { acteur_user_id: acteurUserId ?? null, suppressions });

        return {
            ok: true as const,
            suppressions,
            message: 'Données de test supprimées sur cette machine.',
        };
    },
    // Réinitialisation complète du poste : contrairement à nettoyerDonneesTest
    // (qui garde licence/config/agents/catalogue), ici tout est effacé — y
    // compris la configuration et la licence locale — pour retomber
    // exactement dans l'état d'un poste jamais configuré. Purement local :
    // rien n'est envoyé à l'admin (une licence déjà assignée reste assignée
    // côté admin, à libérer là-bas si besoin de la réattribuer ailleurs).
    resetComplet: (acteurUserId?: number | null) => {
        verifierSuperAdmin(acteurUserId);

        const db = getDb();
        migrer(db);

        // Tables listées dans l'ordre où les tables dépendantes sont vidées
        // avant celles dont elles dépendent (les FK sont de toute façon
        // désactivées pendant la transaction, mais l'ordre reste plus clair
        // à la lecture).
        const toutesLesTables = [
            'colis', 'bagages', 'courriers', 'tickets', 'clients', 'voyages',
            'tarifs', 'itineraire_trajet', 'itineraires', 'trajets',
            'agents', 'users', 'vehicules', 'chauffeurs', 'agences', 'villes',
            'sync_queue', 'config',
        ];
        const suppressions: Record<string, number> = {};

        db.pragma('foreign_keys = OFF');
        try {
            db.transaction(() => {
                for (const table of toutesLesTables) {
                    if (!tableExiste(db, table)) continue;

                    const resultat = db.prepare(`DELETE FROM ${table}`).run();
                    suppressions[table] = resultat.changes;
                }

                if (tableExiste(db, 'sqlite_sequence')) {
                    db.prepare(
                        `DELETE FROM sqlite_sequence WHERE name IN (${toutesLesTables.map(() => '?').join(', ')})`,
                    ).run(...toutesLesTables);
                }
            })();
        } finally {
            db.pragma('foreign_keys = ON');
        }

        logger.info('Réinitialisation complète du poste local effectuée', { acteur_user_id: acteurUserId ?? null, suppressions });

        return {
            ok: true as const,
            suppressions,
            message: 'Poste entièrement réinitialisé.',
        };
    },
};
