import { app } from 'electron';
import { randomUUID } from 'node:crypto';
import { hostname, release } from 'node:os';
import { envoyerPresencePoste } from '../apiClient';
import { getDb } from '../database/connection';
import { logger } from '../logger';
import { ConfigRepository } from '../repositories/ConfigRepository';
import type { Session } from './AuthService';
import { horlogeLocale, PosteJournal, type ActeurPoste, type PeriodePoste } from './PosteJournal';

class PosteSuiviService {
    private config = new ConfigRepository();
    private journal: PosteJournal | null = null;
    private contexte = '';
    private installation = '';
    private agenceId = 0;
    private acteur: ActeurPoste | null = null;
    private sessionAuthentifiee: ActeurPoste | null = null;
    private bailSession = 0;
    private timer: ReturnType<typeof setInterval> | null = null;
    private envoi: Promise<void> | null = null;
    private abort: AbortController | null = null;
    private dernierEnvoi = -Infinity;
    private derniereErreur = -Infinity;
    private suspendu = false;
    private termine = false;

    private proteger(action: () => void): void {
        try { action(); } catch (erreur) { logger.warn('Journal de suivi du poste indisponible.', erreur); }
    }

    demarrer(): void {
        this.proteger(() => this.pointer());
        this.timer = setInterval(() => {
            this.proteger(() => this.pointer());
            if (performance.now() - this.dernierEnvoi >= 60000) void this.envoyer();
        }, 30000);
        void this.envoyer();
    }

    private sauver(periode: PeriodePoste): void {
        getDb().prepare(`INSERT INTO suivi_poste_periodes (uuid, installation_uuid, agence_id, payload, revision, fermee)
            VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(uuid) DO UPDATE SET payload=excluded.payload, revision=excluded.revision, fermee=excluded.fermee`)
            .run(periode.uuid, this.installation, this.agenceId, JSON.stringify(periode), periode.revision, periode.fin_local ? 1 : 0);
    }

    private pointer(): void {
        if (this.termine || this.suspendu) return;
        const agenceId = Number(this.config.obtenir('licence_agence_id'));
        const licence = this.config.obtenir('licence_uuid');
        let installation = this.config.obtenir('suivi_installation_uuid');
        if (agenceId && licence && !installation) {
            installation = randomUUID();
            this.config.definir('suivi_installation_uuid', installation);
        }
        const contexte = agenceId && licence && installation ? `${agenceId}:${installation}` : '';
        const maintenant = new Date();
        const mono = performance.now();
        if (contexte !== this.contexte) {
            this.journal?.fermerTout(maintenant, mono, 'configuration');
            this.journal = null;
            this.acteur = null;
            this.sessionAuthentifiee = null;
            this.contexte = contexte;
            this.installation = installation ?? '';
            this.agenceId = agenceId;
        }
        if (!contexte) return;
        if (!this.journal) {
            const anciennes = getDb().prepare('SELECT payload FROM suivi_poste_periodes WHERE installation_uuid=? AND agence_id=? AND fermee=0')
                .all(this.installation, agenceId) as { payload: string }[];
            this.journal = new PosteJournal((p) => this.sauver(p), maintenant, mono, anciennes.map((p) => JSON.parse(p.payload)));
        }
        if (this.acteur && mono - this.bailSession > 90000) {
            this.journal.session(null, maintenant, mono, 'session_non_confirmee');
            this.acteur = null;
        }
        this.journal.avancer(maintenant, mono);
    }

    connecter(session: Session): void {
        this.proteger(() => {
            this.pointer();
            const agent = session.agentId ? getDb().prepare('SELECT uuid, nom FROM agents WHERE id=?').get(session.agentId) as { uuid: string; nom: string } | undefined : null;
            this.acteur = { user_uuid: session.uuid, agent_uuid: agent?.uuid ?? null, agent_nom: agent?.nom ?? session.nom };
            this.sessionAuthentifiee = this.acteur;
            this.bailSession = performance.now();
            this.journal?.session(this.acteur, new Date(), this.bailSession);
        });
        void this.envoyer();
    }

    presenceSession(active: boolean): void {
        if (active !== true) { this.deconnecter(); return; }
        // Ce signal ne cree jamais une session : elle doit avoir ete authentifiee dans le main.
        this.proteger(() => {
            if (!this.sessionAuthentifiee) return;
            this.bailSession = performance.now();
            if (!this.acteur) {
                this.acteur = this.sessionAuthentifiee;
                this.journal?.session(this.acteur, new Date(), this.bailSession);
            }
        });
    }

    deconnecter(): void {
        if (!this.sessionAuthentifiee && !this.acteur) return;
        this.proteger(() => {
            this.journal?.session(null, new Date(), performance.now());
            this.acteur = null;
            this.sessionAuthentifiee = null;
        });
        void this.envoyer();
    }

    suspendre(): void {
        this.proteger(() => this.journal?.fermerTout(new Date(), performance.now(), 'veille'));
        this.journal = null;
        this.suspendu = true;
        void this.envoyer();
    }

    reprendre(): void {
        this.suspendu = false;
        this.proteger(() => {
            this.pointer();
            if (this.acteur) this.journal?.session(this.acteur, new Date(), performance.now());
        });
        void this.envoyer();
    }

    private envoyer(timeout = 5000): Promise<void> {
        if (this.envoi) return this.envoi;
        this.envoi = this.effectuerEnvoi(timeout).catch((erreur) => {
            if (performance.now() - this.derniereErreur > 300000) {
                logger.warn('Suivi du poste : admin injoignable ou envoi refuse ; historique conserve localement.', { code: erreur?.response?.status ?? erreur?.code ?? 'inconnu' });
                this.derniereErreur = performance.now();
            }
        }).finally(() => { this.envoi = null; this.abort = null; });
        return this.envoi;
    }

    private async effectuerEnvoi(timeout: number): Promise<void> {
        this.proteger(() => this.pointer());
        const token = this.config.obtenir('api_token');
        if (!token || !this.contexte) return;
        const maintenant = new Date();
        const lignes = getDb().prepare(`SELECT payload FROM suivi_poste_periodes
            WHERE installation_uuid=? AND agence_id=? AND revision>revision_synchro ORDER BY rowid LIMIT 100`)
            .all(this.installation, this.agenceId) as { payload: string }[];
        const sequence = Number(this.config.obtenir('suivi_sequence') ?? 0) + 1;
        this.config.definir('suivi_sequence', String(sequence));
        this.abort = new AbortController();
        this.dernierEnvoi = performance.now();
        const reponse = await envoyerPresencePoste(token, {
            installation_uuid: this.installation, licence_uuid: this.config.obtenir('licence_uuid'),
            code_poste: this.config.obtenir('licence_code_poste'), sequence,
            appareil: hostname(), systeme: `${process.platform} ${release()}`, version: app.getVersion(),
            mode_reseau: this.config.obtenir('reseau_mode') ?? 'autonome',
            horloge_locale: horlogeLocale(maintenant), instant_machine: maintenant.toISOString(),
            fuseau: Intl.DateTimeFormat().resolvedOptions().timeZone, decalage_utc_minutes: -maintenant.getTimezoneOffset(),
            application_ouverte: !this.termine && !this.suspendu,
            session_ouverte: !this.termine && !this.suspendu && this.acteur !== null,
            acteur: !this.termine && !this.suspendu ? this.acteur : null,
            periodes: lignes.map((ligne) => JSON.parse(ligne.payload)),
        }, timeout, this.abort.signal);
        getDb().transaction(() => {
            const ack = getDb().prepare('UPDATE suivi_poste_periodes SET revision_synchro=MAX(revision_synchro, ?) WHERE uuid=?');
            for (const periode of reponse.acquittements) ack.run(periode.revision, periode.uuid);
        })();
    }

    async arreter(): Promise<void> {
        if (this.timer) clearInterval(this.timer);
        this.proteger(() => {
            this.pointer();
            this.journal?.fermerTout(new Date(), performance.now(), 'fermeture');
        });
        this.termine = true;
        this.acteur = null;
        this.abort?.abort();
        if (this.envoi) await this.envoi;
        await this.envoyer(1500);
    }
}

export const posteSuiviService = new PosteSuiviService();
