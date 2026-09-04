import type Database from 'better-sqlite3';
import { apiBaseUrl } from '../apiClient';
import { getDb } from '../database/connection';
import { migrer } from '../database/migrate';
import { logger } from '../logger';
import { BootstrapService } from '../services/BootstrapService';
import { localNetworkService, type ModeReseauLocal } from '../services/LocalNetworkService';
import { enregistrerCalibrationImpression, lireCalibrationImpression, type CalibrationImpression } from '../services/ImpressionConfigService';
import { UserRepository } from '../repositories/UserRepository';
import { SyncQueueRepository } from '../repositories/SyncQueueRepository';
import { syncEngine } from '../sync/SyncEngine';

/**
 * Traduit une ligne de la file en libellé lisible par le chef de gare.
 * Mêmes colonnes de montant que le tableau de bord : montant + timbre pour un
 * ticket (la commission courtier est prise sur la part de la gare, elle ne
 * change pas ce que le client a payé), montant pour un bagage, montant_total
 * pour un courrier.
 */
const SOURCES_ENVOI: Record<string, { libelle: string; requete: string | null }> = {
    tickets: {
        libelle: 'Ticket',
        requete: `SELECT numero_ticket AS numero, (montant + timbre) AS montant FROM tickets WHERE uuid = ?`,
    },
    bagages: {
        libelle: 'Bagage',
        requete: `SELECT numero_bagage AS numero, montant FROM bagages WHERE uuid = ?`,
    },
    courriers: {
        libelle: 'Courrier',
        requete: `SELECT numero_courrier AS numero, montant_total AS montant FROM courriers WHERE uuid = ?`,
    },
    courriers_internationaux: {
        libelle: 'Courrier international',
        requete: `SELECT numero_courrier AS numero, montant_total AS montant FROM courriers_internationaux WHERE uuid = ?`,
    },
    lots_bordereaux: {
        libelle: 'Bordereau',
        requete: `SELECT reference AS numero, NULL AS montant FROM lots_bordereaux WHERE uuid = ?`,
    },
    convois: {
        libelle: 'Convoi',
        requete: `SELECT reference AS numero, montant_fixe AS montant FROM convois WHERE uuid = ?`,
    },
    clients: { libelle: 'Client', requete: null },
    voyages: { libelle: 'Voyage', requete: null },
    users: { libelle: 'Compte', requete: null },
};

export type EnvoiRefuse = {
    id: number;
    entite: string;
    libelle: string;
    numero: string | null;
    montant: number | null;
    enregistreLe: string;
    tentatives: number;
    message: string;
};

function listerEnvoisRefuses(): EnvoiRefuse[] {
    const lignes = fileSync.enErreur();
    if (lignes.length === 0) return [];

    const db = getDb();

    return lignes.map((ligne) => {
        const source = SOURCES_ENVOI[ligne.entite];
        let numero: string | null = null;
        let montant: number | null = null;

        if (source?.requete) {
            // La ligne locale peut avoir disparu — c'est même l'une des causes
            // du refus : on garde l'entrée dans la liste, sans montant.
            const detail = db.prepare(source.requete).get(ligne.entite_uuid) as
                | { numero: string | null; montant: number }
                | undefined;

            numero = detail?.numero ?? null;
            montant = detail ? detail.montant : null;
        }

        return {
            id: ligne.id,
            entite: ligne.entite,
            libelle: source?.libelle ?? ligne.entite,
            numero,
            montant,
            enregistreLe: ligne.created_at,
            tentatives: ligne.tentatives,
            message: ligne.derniere_erreur ?? 'Refus du serveur sans détail.',
        };
    });
}

const service = new BootstrapService();
const users = new UserRepository();
const fileSync = new SyncQueueRepository();

// BootstrapService.actualiser() calcule déjà le message précis (429, 404,
// réseau...) via messageErreurBootstrap() et le renvoie dans un Error simple :
// on le réutilise tel quel plutôt que de re-tenter une détection axios ici,
// qui échoue toujours puisque l'erreur d'origine n'est plus un AxiosError à
// ce stade (elle a été ré-emballée un niveau plus bas).
function messageErreurActualisation(erreur: unknown): string {
    if (erreur instanceof Error && erreur.message) {
        return erreur.message;
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
            // Un envoi définitivement refusé quitte la file : sans ce compteur,
            // « enAttente: 0 » laisserait croire que tout est remonté alors que
            // de l'argent encaissé manque côté admin.
            refuses: fileSync.compterEnErreur(),
        };
    },
    envoisRefuses: () => ({
        total: fileSync.compterEnErreur(),
        operations: listerEnvoisRefuses(),
    }),
    // Relance les envois refusés puis rejoue un cycle complet : on rend l'état
    // réel de la file, pas seulement le nombre de lignes remises en attente.
    relancerEnvoisRefuses: async (id?: number | null) => {
        const relances = fileSync.reprogrammer(typeof id === 'number' ? id : undefined);
        await syncEngine.runCycle();

        return {
            ok: true as const,
            relances,
            restants: fileSync.compterEnErreur(),
            enAttente: fileSync.compterEnAttente(),
        };
    },
    reseauLocal: () => localNetworkService.configuration(),
    calibrationImpression: () => lireCalibrationImpression(),
    enregistrerCalibrationImpression: (params: Partial<CalibrationImpression>) => enregistrerCalibrationImpression(params),
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

        const tablesOperations = [
            'lot_courriers_internationaux', 'lot_bagages', 'lot_courriers', 'lots_bordereaux',
            'convois',
            'colis_internationaux', 'courriers_internationaux',
            'colis', 'bagages', 'courriers', 'tickets', 'clients', 'voyages', 'sync_queue',
        ];
        const suppressions: Record<string, number> = {};

        db.pragma('foreign_keys = OFF');
        try {
            db.transaction(() => {
                for (const table of tablesOperations) {
                    if (!tableExiste(db, table)) continue;

                    const resultat = db.prepare(`DELETE FROM ${table}`).run();
                    suppressions[table] = resultat.changes;
                }

                // Les compteurs visibles ne sont jamais remis à zéro, même
                // lors du nettoyage des données de test. Cela évite de
                // réutiliser un numéro déjà transmis à l'admin.

                if (tableExiste(db, 'sqlite_sequence')) {
                    db.prepare(
                        `DELETE FROM sqlite_sequence
                          WHERE name IN ('voyages', 'clients', 'tickets', 'bagages', 'courriers', 'colis',
                                         'courriers_internationaux', 'colis_internationaux', 'lots_bordereaux', 'convois', 'sync_queue')`,
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
            'lot_courriers_internationaux', 'lot_bagages', 'lot_courriers', 'lots_bordereaux',
            'convois',
            'colis_internationaux', 'courriers_internationaux',
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
