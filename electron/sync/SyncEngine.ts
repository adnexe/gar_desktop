import axios from 'axios';
import { envoyerOperationSync, type OperationSyncApi } from '../apiClient';
import { getDb } from '../database/connection';
import { migrer } from '../database/migrate';
import { logger } from '../logger';
import { ConfigRepository } from '../repositories/ConfigRepository';
import { BootstrapService } from '../services/BootstrapService';
import { SyncQueueRepository } from '../repositories/SyncQueueRepository';
import { UserRepository } from '../repositories/UserRepository';
import { eventBus } from './EventBus';

type LigneSync = {
    id: number;
    entite: string;
    entite_uuid: string;
    operation: string;
    payload: string;
    tentatives: number;
};

type DecisionErreur = {
    statut: 'temporaire' | 'definitive' | 'stop' | 'expiration' | 'serveur';
    message: string;
};

// Un élément qui expire systématiquement ne doit pas retenir toute la file
// derrière lui : passé ce nombre de tentatives, on le laisse de côté pour ce
// cycle et on continue avec les suivants. Il reste en attente et sera réessayé
// — rien n'est perdu — mais les ventes suivantes remontent enfin à l'admin.
const TENTATIVES_AVANT_MISE_DE_COTE = 3;

// Si plusieurs envois expirent dans le même cycle, la cause n'est plus un
// élément précis mais le serveur ou le lien réseau : inutile d'insister,
// on s'arrête et on réessaiera au prochain cycle.
const EXPIRATIONS_TOLEREES_PAR_CYCLE = 3;
const ERREURS_SERVEUR_TOLEREES_PAR_CYCLE = 3;

export class SyncEngine {
    private readonly repo = new SyncQueueRepository();
    private readonly config = new ConfigRepository();
    private readonly bootstrap = new BootstrapService();
    private readonly users = new UserRepository();
    private enCours = false;
    private demarre = false;
    private derniereVerificationLicence = 0;
    private derniereActualisationCatalogue = 0;
    private minuterie: ReturnType<typeof setTimeout> | null = null;
    private intervalle: ReturnType<typeof setInterval> | null = null;

    demarrer(): void {
        if (this.demarre) return;

        this.demarre = true;
        // L'écran de connexion (Login.vue) fait déjà un check-in silencieux à
        // son montage, à chaque lancement de l'app. Sans ce seed, ce premier
        // cycle (2s après demarrer()) déclenchait un DEUXIÈME appel bootstrap
        // quasi simultané à chaque démarrage — deux requêtes pour un seul
        // besoin, ce qui use inutilement le quota anti-abus côté admin.
        this.derniereVerificationLicence = Date.now();
        this.derniereActualisationCatalogue = Date.now();
        eventBus.ecouter('file:ajout', () => this.planifier(300));
        this.intervalle = setInterval(() => this.planifier(0), 30_000);
        this.planifier(2_000);
    }

    arreter(): void {
        if (this.minuterie) {
            clearTimeout(this.minuterie);
            this.minuterie = null;
        }

        if (this.intervalle) {
            clearInterval(this.intervalle);
            this.intervalle = null;
        }

        this.demarre = false;
    }

    planifier(delaiMs = 0): void {
        if (this.minuterie) {
            clearTimeout(this.minuterie);
        }

        this.minuterie = setTimeout(() => {
            this.minuterie = null;
            void this.runCycle();
        }, delaiMs);
    }

    async runCycle(): Promise<void> {
        if (this.enCours) {
            return;
        }

        this.enCours = true;
        eventBus.emettre('sync:demarree');

        try {
            migrer(getDb());
            const lotsRecuperes = this.repo.assurerLotsLocauxDansFile();
            if (lotsRecuperes > 0) {
                logger.info(`${lotsRecuperes} lot(s) local(aux) ajouté(s) à la file de synchronisation.`);
            }

            // Licence/agence revérifiées en ligne au plus une fois toutes les
            // 5 minutes : assez rapide pour couper un poste déjà connecté,
            // sans saturer l'admin.
            if (Date.now() - this.derniereVerificationLicence > 300_000) {
                this.derniereVerificationLicence = Date.now();
                await this.bootstrap.verifierLicenceEnLigne();
            }

            // Check-in silencieux régulier : agents, comptes, agence, tarifs,
            // voyages futurs... Si le serveur répond, l'état local est remis
            // à jour; s'il ne répond pas, on garde la caisse opérationnelle.
            if (Date.now() - this.derniereActualisationCatalogue > 300_000) {
                this.derniereActualisationCatalogue = Date.now();
                try {
                    await this.bootstrap.actualiser(5000);
                } catch {
                    logger.warn('Check-in catalogue ignoré : serveur admin injoignable.');
                }
            }

            const token = this.config.obtenir('api_token');
            if (!token) {
                return;
            }

            const lignes = this.repo.enAttente(50) as LigneSync[];
            let expirationsCycle = 0;
            let erreursServeurCycle = 0;

            for (const ligne of lignes) {
                if (this.operationIgnoreeSurPosteClient(ligne.entite)) {
                    this.repo.marquerSynchronise(ligne.id);
                    continue;
                }

                const operation = this.operationPour(ligne);
                if (!operation) {
                    this.repo.marquerErreurDefinitive(ligne.id, 'Donnée locale introuvable pour la synchronisation.');
                    continue;
                }

                try {
                    await envoyerOperationSync(token, operation);
                    this.repo.marquerSynchronise(ligne.id);
                    if (ligne.entite === 'users') {
                        this.users.marquerActionSynchronisee(operation.payload);
                    }
                } catch (erreur) {
                    const decision = this.classerErreur(erreur);

                    if (decision.statut === 'definitive') {
                        this.repo.marquerErreurDefinitive(ligne.id, decision.message);
                        continue;
                    }

                    this.repo.marquerEchecTemporaire(ligne.id, decision.message);

                    if (decision.statut === 'expiration') {
                        expirationsCycle++;

                        // Trop d'expirations d'affilée : c'est le serveur ou le
                        // réseau, pas cet élément. On arrête le cycle.
                        if (expirationsCycle >= EXPIRATIONS_TOLEREES_PAR_CYCLE) {
                            logger.warn(`Synchronisation interrompue : ${expirationsCycle} envoi(s) expiré(s) dans ce cycle.`);
                            break;
                        }

                        // Élément qui expire depuis plusieurs cycles : on passe
                        // au suivant pour ne pas geler toute la file derrière lui.
                        if (ligne.tentatives + 1 >= TENTATIVES_AVANT_MISE_DE_COTE) {
                            logger.warn(`Élément ${ligne.entite} #${ligne.id} mis de côté après ${ligne.tentatives + 1} tentative(s) : la file continue.`);
                            continue;
                        }

                        break;
                    }

                    if (decision.statut === 'serveur') {
                        erreursServeurCycle++;

                        if (erreursServeurCycle >= ERREURS_SERVEUR_TOLEREES_PAR_CYCLE) {
                            logger.warn(`Synchronisation interrompue : ${erreursServeurCycle} erreur(s) serveur dans ce cycle.`);
                            break;
                        }

                        // Une ancienne donnée refusée en permanence par le
                        // serveur ne doit pas retenir les lots et ventes plus
                        // récents. Elle reste en attente pour être retentée.
                        if (ligne.tentatives + 1 >= TENTATIVES_AVANT_MISE_DE_COTE) {
                            logger.warn(`Élément ${ligne.entite} #${ligne.id} mis de côté après ${ligne.tentatives + 1} erreur(s) serveur : la file continue.`);
                            continue;
                        }

                        break;
                    }

                    if (decision.statut === 'stop') {
                        break;
                    }
                }
            }
        } catch (erreur) {
            logger.warn('Cycle de synchronisation interrompu.', erreur);
            eventBus.emettre('sync:erreur', erreur);
        } finally {
            this.enCours = false;
            eventBus.emettre('sync:terminee');

            if (this.repo.compterEnAttente() > 0) {
                this.planifier(15_000);
            }
        }
    }

    private operationPour(ligne: LigneSync): OperationSyncApi | null {
        const payload = this.payloadPour(ligne);
        if (!payload) return null;

        return {
            entite: ligne.entite,
            uuid: ligne.entite_uuid,
            operation: ligne.operation,
            payload,
        };
    }

    private operationIgnoreeSurPosteClient(entite: string): boolean {
        if (this.config.obtenir('reseau_mode') !== 'client') return false;

        return ['voyages', 'tickets'].includes(entite);
    }

    private payloadPour(ligne: LigneSync): Record<string, unknown> | null {
        switch (ligne.entite) {
            case 'clients':
                return this.clientPayload(ligne.entite_uuid);
            case 'voyages':
                return this.voyagePayload(ligne.entite_uuid);
            case 'tickets':
                return this.ticketPayload(ligne.entite_uuid);
            case 'bagages':
                return this.bagagePayload(ligne.entite_uuid);
            case 'courriers':
                return this.courrierPayload(ligne.entite_uuid);
            case 'courriers_internationaux':
                return this.courrierInternationalPayload(ligne.entite_uuid);
            case 'lots_bordereaux':
                return this.lotBordereauPayload(ligne.entite_uuid);
            case 'convois':
                return this.convoiPayload(ligne.entite_uuid);
            case 'users':
                return JSON.parse(ligne.payload) as Record<string, unknown>;
            default:
                return JSON.parse(ligne.payload) as Record<string, unknown>;
        }
    }

    private clientPayload(uuid: string): Record<string, unknown> | null {
        return getDb()
            .prepare('SELECT uuid, nom, prenoms, telephone, cni, source, created_at, updated_at FROM clients WHERE uuid = ?')
            .get(uuid) as Record<string, unknown> | null;
    }

    private voyagePayload(uuid: string): Record<string, unknown> | null {
        const ligne = getDb()
            .prepare(
                `SELECT uuid, agence_depart_id, itineraire_id, vehicule_id, chauffeur_id,
                        date_depart, heure_depart, numero_depart, statut, created_at, updated_at
                 FROM voyages
                 WHERE uuid = ?`,
            )
            .get(uuid) as Record<string, unknown> | undefined;

        return ligne ?? null;
    }

    private ticketPayload(uuid: string): Record<string, unknown> | null {
        const ligne = getDb()
            .prepare(
                `SELECT t.uuid, t.numero_ticket, t.agent_id, t.user_id, t.trajet_id,
                        t.type_billet, t.numero_place, t.montant, t.timbre, t.commission, t.tarification,
                        t.statut_paiement, t.statut_ticket, t.created_at, t.updated_at,
                        v.uuid AS voyage_uuid, c.uuid AS client_uuid
                 FROM tickets t
                 JOIN voyages v ON v.id = t.voyage_id
                 LEFT JOIN clients c ON c.id = t.client_id
                 WHERE t.uuid = ?`,
            )
            .get(uuid) as Record<string, unknown> | undefined;

        if (!ligne) return null;

        return {
            ...ligne,
            client: typeof ligne.client_uuid === 'string' ? this.clientPayload(ligne.client_uuid) : null,
        };
    }

    private bagagePayload(uuid: string): Record<string, unknown> | null {
        const ligne = getDb()
            .prepare(
                `SELECT b.uuid, b.numero_bagage, b.agence_id, b.ville_arrivee_id, b.agence_arrivee_id,
                        b.user_id, b.agent_id, b.description, b.valeur, b.montant, b.statut_paiement,
                        b.created_at, b.updated_at,
                        COALESCE(t.uuid, b.ticket_uuid) AS ticket_uuid,
                        COALESCE(t.numero_ticket, b.ticket_numero) AS ticket_numero,
                        COALESCE(v.uuid, b.voyage_uuid) AS voyage_uuid,
                        cb.uuid AS client_uuid
                 FROM bagages b
                 LEFT JOIN tickets t ON t.id = b.ticket_id
                 LEFT JOIN voyages v ON v.id = b.voyage_id
                 LEFT JOIN clients cb ON cb.id = b.client_id
                 WHERE b.uuid = ?`,
            )
            .get(uuid) as Record<string, unknown> | undefined;

        if (!ligne) return null;

        return {
            ...ligne,
            client: typeof ligne.client_uuid === 'string' ? this.clientPayload(ligne.client_uuid) : null,
        };
    }

    private courrierPayload(uuid: string): Record<string, unknown> | null {
        const ligne = getDb()
            .prepare(
                `SELECT c.uuid, c.numero_courrier, c.agence_depart_id, c.ville_arrivee_id, c.agence_arrivee_id,
                        c.user_id, c.agent_id, c.prix_expedition, c.montant_colis, c.montant_total,
                        c.statut, c.created_at, c.updated_at,
                        COALESCE(v.uuid, c.voyage_uuid) AS voyage_uuid,
                        exp.uuid AS expediteur_uuid,
                        dest.uuid AS destinataire_uuid
                 FROM courriers c
                 LEFT JOIN voyages v ON v.id = c.voyage_id
                 JOIN clients exp ON exp.id = c.expediteur_id
                 JOIN clients dest ON dest.id = c.destinataire_id
                 WHERE c.uuid = ?`,
            )
            .get(uuid) as Record<string, unknown> | undefined;

        if (!ligne) return null;

        const colis = getDb()
            .prepare(
                `SELECT uuid, nom, type, quantite, prix, montant, created_at, updated_at
                 FROM colis
                 WHERE courrier_id = (SELECT id FROM courriers WHERE uuid = ?)
                 ORDER BY id ASC`,
            )
            .all(uuid) as Record<string, unknown>[];

        return {
            ...ligne,
            expediteur: typeof ligne.expediteur_uuid === 'string' ? this.clientPayload(ligne.expediteur_uuid) : null,
            destinataire: typeof ligne.destinataire_uuid === 'string' ? this.clientPayload(ligne.destinataire_uuid) : null,
            colis,
        };
    }

    private courrierInternationalPayload(uuid: string): Record<string, unknown> | null {
        const ligne = getDb()
            .prepare(
                `SELECT c.uuid, c.numero_courrier, c.agence_depart_id, c.pays_destination_id, c.ville_destination_id,
                        c.user_id, c.agent_id, c.pays_destination, c.ville_destination, c.adresse_destination,
                        c.transporteur, c.tracking_externe, c.mode_facturation, c.pourcentage_frais,
                        c.frais_expedition, c.valeur_colis, c.montant_total, c.statut,
                        c.observation, c.created_at, c.updated_at,
                        exp.uuid AS expediteur_uuid,
                        dest.uuid AS destinataire_uuid
                 FROM courriers_internationaux c
                 JOIN clients exp ON exp.id = c.expediteur_id
                 JOIN clients dest ON dest.id = c.destinataire_id
                 WHERE c.uuid = ?`,
            )
            .get(uuid) as Record<string, unknown> | undefined;

        if (!ligne) return null;

        const colis = getDb()
            .prepare(
                `SELECT uuid, nom, type, quantite, poids_kg, prix, montant, frais_unitaire, frais_expedition, created_at, updated_at
                 FROM colis_internationaux
                 WHERE courrier_international_id = (SELECT id FROM courriers_internationaux WHERE uuid = ?)
                 ORDER BY id ASC`,
            )
            .all(uuid) as Record<string, unknown>[];

        return {
            ...ligne,
            expediteur: typeof ligne.expediteur_uuid === 'string' ? this.clientPayload(ligne.expediteur_uuid) : null,
            destinataire: typeof ligne.destinataire_uuid === 'string' ? this.clientPayload(ligne.destinataire_uuid) : null,
            colis,
        };
    }

    private lotBordereauPayload(uuid: string): Record<string, unknown> | null {
        const ligne = getDb()
            .prepare(
                `SELECT l.uuid, l.type, l.agence_id, l.numero_lot, l.reference, l.date_operation,
                        l.ville_destination_id, l.destination, l.voyage_uuid, l.voyage_libelle,
                        l.statut, l.cree_par_user_id, u.name AS cree_par_nom,
                        l.expedie_at, l.arrive_at, l.livre_at, l.created_at, l.updated_at
                 FROM lots_bordereaux l
                 LEFT JOIN users u ON u.id = l.cree_par_user_id
                 WHERE l.uuid = ?`,
            )
            .get(uuid) as Record<string, unknown> | undefined;

        if (!ligne || typeof ligne.type !== 'string') return null;

        const definitions: Record<string, { lien: string; operation: string; colonne: string }> = {
            courrier: { lien: 'lot_courriers', operation: 'courriers', colonne: 'courrier_id' },
            bagage: { lien: 'lot_bagages', operation: 'bagages', colonne: 'bagage_id' },
            courrier_international: {
                lien: 'lot_courriers_internationaux',
                operation: 'courriers_internationaux',
                colonne: 'courrier_international_id',
            },
        };
        const definition = definitions[ligne.type];
        if (!definition) return null;

        const elements = getDb()
            .prepare(
                `SELECT o.uuid
                 FROM ${definition.lien} lien
                 JOIN ${definition.operation} o ON o.id = lien.${definition.colonne}
                 WHERE lien.lot_id = (SELECT id FROM lots_bordereaux WHERE uuid = ?)
                 ORDER BY lien.created_at, o.id`,
            )
            .all(uuid) as Array<{ uuid: string }>;

        return {
            ...ligne,
            element_uuids: elements.map((element) => element.uuid),
        };
    }

    private convoiPayload(uuid: string): Record<string, unknown> | null {
        return (getDb().prepare(
            `SELECT c.uuid, c.reference, c.agence_id, c.ville_destination_id,
                    c.precision_destination, c.nombre_places, c.montant_fixe,
                    c.date_depart, c.heure_depart, c.date_retour, c.heure_retour,
                    c.statut, c.cree_par_user_id, COALESCE(c.cree_par_nom, u.name) AS cree_par_nom,
                    c.created_at, c.updated_at
             FROM convois c
             LEFT JOIN users u ON u.id = c.cree_par_user_id
             WHERE c.uuid = ?`,
        ).get(uuid) as Record<string, unknown> | undefined) ?? null;
    }

    private classerErreur(erreur: unknown): DecisionErreur {
        if (!axios.isAxiosError(erreur)) {
            return { statut: 'stop', message: 'Erreur de synchronisation inconnue.' };
        }

        if (!erreur.response) {
            // Délai dépassé : distinct d'un réseau coupé. Le serveur est
            // joignable mais n'a pas répondu à temps pour CET élément — il ne
            // doit donc pas condamner les suivants (voir runCycle).
            if (erreur.code === 'ECONNABORTED' || erreur.code === 'ETIMEDOUT') {
                return { statut: 'expiration', message: erreur.message };
            }

            return { statut: 'stop', message: erreur.message };
        }

        const status = erreur.response.status;
        const data = erreur.response.data as { message?: string; retryable?: boolean } | undefined;
        const message = data?.message ?? erreur.message;

        if (status === 401 || status === 403) {
            return { statut: 'stop', message };
        }

        if (data?.retryable) {
            return { statut: 'temporaire', message };
        }

        if (status >= 400 && status < 500) {
            return { statut: 'definitive', message };
        }

        return { statut: 'serveur', message };
    }
}

export const syncEngine = new SyncEngine();
