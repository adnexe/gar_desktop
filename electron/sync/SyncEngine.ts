import axios from 'axios';
import { net } from 'electron';
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
    statut: 'temporaire' | 'definitive' | 'stop';
    message: string;
};

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
        if (this.enCours || !net.isOnline()) {
            return;
        }

        this.enCours = true;
        eventBus.emettre('sync:demarree');

        try {
            migrer(getDb());

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

        return ['clients', 'voyages', 'tickets'].includes(entite);
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
                        t.type_billet, t.numero_place, t.montant, t.timbre, t.tarification,
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
                        COALESCE(v.uuid, b.voyage_uuid) AS voyage_uuid
                 FROM bagages b
                 LEFT JOIN tickets t ON t.id = b.ticket_id
                 LEFT JOIN voyages v ON v.id = b.voyage_id
                 WHERE b.uuid = ?`,
            )
            .get(uuid) as Record<string, unknown> | undefined;

        return ligne ?? null;
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

    private classerErreur(erreur: unknown): DecisionErreur {
        if (!axios.isAxiosError(erreur)) {
            return { statut: 'stop', message: 'Erreur de synchronisation inconnue.' };
        }

        if (!erreur.response) {
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

        return { statut: 'stop', message };
    }
}

export const syncEngine = new SyncEngine();
