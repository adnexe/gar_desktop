import axios from 'axios';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { networkInterfaces } from 'node:os';
import { randomBytes } from 'node:crypto';
import { getDb } from '../database/connection';
import { migrer } from '../database/migrate';
import { ConfigRepository } from '../repositories/ConfigRepository';
import { AgenceRepository } from '../repositories/AgenceRepository';
import { CompagnieRepository, type CompagnieLocale } from '../repositories/CompagnieRepository';
import { AuthController } from '../controllers/AuthController';
import { ReferentielController } from '../controllers/ReferentielController';
import { VenteController } from '../controllers/VenteController';
import { BagageController } from '../controllers/BagageController';
import { CourrierController } from '../controllers/CourrierController';
import { VoyageController } from '../controllers/VoyageController';
import { HistoriqueController } from '../controllers/HistoriqueController';
import { VoyageRepository, type VoyageServeur } from '../repositories/VoyageRepository';
import { ClientRepository, type ClientServeur } from '../repositories/ClientRepository';
import { TicketRepository, type TicketServeur } from '../repositories/TicketRepository';

export type ModeReseauLocal = 'autonome' | 'serveur' | 'client';

export interface ConfigurationReseauLocal {
    mode: ModeReseauLocal;
    serveurUrl: string | null;
    port: number;
    secret: string | null;
    actif: boolean;
    adresses: string[];
    agence: string | null;
}

type ResultatProxy = { proxied: false } | { proxied: true; resultat: unknown };

interface AgenceServeurLocal {
    id: number;
    uuid: string;
    reference: string;
    nom: string;
    ville_id: number;
    ville_uuid: string;
    ville_nom: string;
    adresse: string | null;
    telephone: string | null;
}

interface StatutServeurLocal {
    ok: boolean;
    agence: string | null;
    agenceDetails: AgenceServeurLocal | null;
    compagnie: CompagnieLocale;
}

const PORT_DEFAUT = 3750;
const SECRET_HEADER = 'x-gar-local-secret';

const handlers: Record<string, (...args: never[]) => unknown> = {
    'auth:connecter': AuthController.connecter,
    'referentiel:villes': ReferentielController.villes,
    'referentiel:agencesParVille': ReferentielController.agencesParVille,
    'referentiel:voyagesDeAgence': ReferentielController.voyagesDeAgence,
    'vente:rechercherVoyages': VenteController.rechercherVoyages,
    'vente:rechercherClient': VenteController.rechercherClient,
    'vente:exporterClientPourClient': VenteController.exporterClientPourClient,
    'vente:exporterTicketPourClient': VenteController.exporterTicketPourClient,
    'vente:exporterTicketsPourClient': VenteController.exporterTicketsPourClient,
    'vente:vendre': VenteController.vendre,
    'vente:confirmerImpression': VenteController.confirmerImpression,
    'vente:annulerImpression': VenteController.annulerImpression,
    'vente:ventesDuJour': VenteController.ventesDuJour,
    'vente:finDeCaisse': VenteController.finDeCaisse,
    'bagage:rechercherTicket': BagageController.rechercherTicket,
    'bagage:enregistrer': BagageController.enregistrer,
    'bagage:confirmerImpression': BagageController.confirmerImpression,
    'bagage:annulerImpression': BagageController.annulerImpression,
    'bagage:duJour': BagageController.duJour,
    'bagage:finDeCaisse': BagageController.finDeCaisse,
    'courrier:enregistrer': CourrierController.enregistrer,
    'courrier:confirmerImpression': CourrierController.confirmerImpression,
    'courrier:annulerImpression': CourrierController.annulerImpression,
    'courrier:duJour': CourrierController.duJour,
    'courrier:finDeCaisse': CourrierController.finDeCaisse,
    'voyage:formulaire': VoyageController.formulaire,
    'voyage:creer': VoyageController.creer,
    'voyage:liste': VoyageController.liste,
    'voyage:exporterPourClient': VoyageController.exporterPourClient,
    'historique:duJour': HistoriqueController.duJour,
};

const canauxLectureDepuisServeur = new Set<string>();

export class LocalNetworkService {
    private readonly config = new ConfigRepository();
    private readonly agences = new AgenceRepository();
    private readonly compagnie = new CompagnieRepository();
    private readonly voyages = new VoyageRepository();
    private readonly clients = new ClientRepository();
    private readonly tickets = new TicketRepository();
    private serveur: Server | null = null;
    private portActif: number | null = null;

    configuration(): ConfigurationReseauLocal {
        const mode = this.mode();
        const port = this.port();
        const serveurUrl = mode === 'client'
            ? this.config.obtenir('reseau_serveur_url')
            : this.config.obtenir('reseau_client_serveur_url');
        const secret = mode === 'serveur'
            ? this.config.obtenir('reseau_secret')
            : mode === 'client'
                ? this.config.obtenir('reseau_secret')
                : this.config.obtenir('reseau_client_secret');
        const agence = this.agences.actuelle();

        return {
            mode,
            serveurUrl,
            port,
            secret,
            actif: this.serveur !== null,
            adresses: this.adresses(port),
            agence: agence ? `${agence.nom} - ${agence.ville_nom}` : null,
        };
    }

    async configurer(params: { mode: ModeReseauLocal; serveurUrl?: string | null; port?: number | null; secret?: string | null }): Promise<ConfigurationReseauLocal> {
        migrer(getDb());

        const mode = params.mode;
        if (!['autonome', 'serveur', 'client'].includes(mode)) {
            throw new Error('Mode réseau local invalide.');
        }

        if (mode === 'serveur') {
            const port = params.port && params.port > 0 ? Math.trunc(params.port) : this.port();
            const secret = this.mode() === 'serveur' ? this.config.obtenir('reseau_secret') ?? this.genererSecret() : this.genererSecret();

            this.config.definir('reseau_mode', mode);
            this.config.definir('reseau_port', String(port));
            this.config.definir('reseau_secret', secret);
            this.config.supprimer('reseau_serveur_url');
            await this.demarrerServeur(port);
        } else if (mode === 'client') {
            const serveurUrl = this.normaliserUrl(params.serveurUrl ?? '');
            const secret = (params.secret ?? '').trim();

            if (!serveurUrl || !secret) {
                throw new Error("Adresse de la caisse serveur et code réseau obligatoires.");
            }

            this.refuserConnexionSurCePoste(serveurUrl);
            const statut = await this.recupererStatutServeur(serveurUrl, secret);
            if (!statut.ok || !statut.agenceDetails) {
                throw new Error("La caisse serveur n'est pas configurée pour une agence.");
            }

            this.enregistrerConfigurationClient(statut);
            this.config.definir('reseau_mode', mode);
            this.config.definir('reseau_serveur_url', serveurUrl);
            this.config.definir('reseau_secret', secret);
            this.config.definir('reseau_client_serveur_url', serveurUrl);
            this.config.definir('reseau_client_secret', secret);
            await this.arreterServeur();
        } else {
            this.config.definir('reseau_mode', mode);
            this.config.supprimer('reseau_serveur_url');
            this.config.supprimer('reseau_secret');
            await this.arreterServeur();
        }

        return this.configuration();
    }

    async demarrerDepuisConfig(): Promise<void> {
        migrer(getDb());
        if (this.mode() === 'serveur') {
            await this.demarrerServeur(this.port());
        }
    }

    async arreter(): Promise<void> {
        await this.arreterServeur();
    }

    async testerClient(serveurUrl: string, secret: string): Promise<{ ok: boolean; message: string; agence?: string | null }> {
        try {
            this.refuserConnexionSurCePoste(serveurUrl);
            const data = await this.recupererStatutServeur(serveurUrl, secret);

            return {
                ok: !!data.ok,
                message: data.ok ? 'Connexion au serveur local réussie.' : 'Réponse serveur invalide.',
                agence: data.agence ?? null,
            };
        } catch (erreur) {
            return {
                ok: false,
                message: erreur instanceof Error ? erreur.message : 'Serveur local injoignable.',
            };
        }
    }

    async actualiserVoyagesDepuisServeur(agenceId: number, date?: string | null): Promise<{ ok: boolean; nombre: number; tickets: number; message: string }> {
        migrer(getDb());

        if (this.mode() !== 'client') {
            return { ok: true, nombre: 0, tickets: 0, message: 'Ce poste utilise déjà sa base locale.' };
        }

        const { serveurUrl, secret } = this.configurationClientActive();

        const voyages = await this.appelerServeurLocal<VoyageServeur[]>(serveurUrl, secret, 'voyage:exporterPourClient', [agenceId, date ?? null]);
        const nombre = this.voyages.importerDepuisServeur(voyages);
        const tickets = await this.appelerServeurLocal<TicketServeur[]>(serveurUrl, secret, 'vente:exporterTicketsPourClient', [agenceId, date ?? null]);
        const nombreTickets = this.importerTicketsDepuisServeur(tickets);

        return {
            ok: true,
            nombre,
            tickets: nombreTickets,
            message: nombre > 0 || nombreTickets > 0
                ? `${nombre} voyage${nombre > 1 ? 's' : ''} et ${nombreTickets} ticket${nombreTickets > 1 ? 's' : ''} mis à jour depuis la caisse serveur.`
                : 'Aucun nouveau voyage ou ticket à récupérer depuis la caisse serveur.',
        };
    }

    async proxySiClient(canal: string, args: unknown[]): Promise<ResultatProxy> {
        if (this.mode() !== 'client') {
            return { proxied: false };
        }

        if (canal === 'bagage:rechercherTicket') {
            const code = typeof args[0] === 'string' ? args[0] : '';
            const local = BagageController.rechercherTicket(code);
            if (local) return { proxied: true, resultat: local };

            await this.actualiserTicketDepuisServeur(code);

            return { proxied: true, resultat: BagageController.rechercherTicket(code) };
        }

        if (canal === 'vente:rechercherClient') {
            const telephone = typeof args[0] === 'string' ? args[0] : '';
            const local = VenteController.rechercherClient(telephone);
            if (local) return { proxied: true, resultat: local };

            await this.actualiserClientDepuisServeur(telephone);

            return { proxied: true, resultat: VenteController.rechercherClient(telephone) };
        }

        if (!canauxLectureDepuisServeur.has(canal) || !(canal in handlers)) {
            return { proxied: false };
        }

        const { serveurUrl, secret } = this.configurationClientActive();
        const data = await this.appelerServeurLocal(serveurUrl, secret, canal, args);

        return { proxied: true, resultat: data };
    }

    private async actualiserTicketDepuisServeur(code: string): Promise<void> {
        const codeNettoye = code.trim();
        if (!codeNettoye) return;

        const { serveurUrl, secret } = this.configurationClientActive();
        const ticket = await this.appelerServeurLocal<TicketServeur | null>(serveurUrl, secret, 'vente:exporterTicketPourClient', [codeNettoye]);
        if (!ticket) return;

        this.importerTicketsDepuisServeur([ticket]);
    }

    private async actualiserClientDepuisServeur(telephone: string): Promise<void> {
        const telephoneNettoye = telephone.trim();
        if (!telephoneNettoye || telephoneNettoye.length < 3) return;

        const { serveurUrl, secret } = this.configurationClientActive();
        const client = await this.appelerServeurLocal<ClientServeur | null>(serveurUrl, secret, 'vente:exporterClientPourClient', [telephoneNettoye]);
        this.clients.importerDepuisServeur(client);
    }

    private importerTicketsDepuisServeur(tickets: TicketServeur[]): number {
        if (!Array.isArray(tickets) || tickets.length === 0) return 0;

        for (const ticket of tickets) {
            if (ticket.voyage) {
                this.voyages.importerDepuisServeur([ticket.voyage]);
            }
            if (ticket.client) {
                this.clients.importerDepuisServeur(ticket.client);
            }
        }

        return this.tickets.importerDepuisServeur(tickets);
    }

    private configurationClientActive(): { serveurUrl: string; secret: string } {
        const serveurUrl = this.config.obtenir('reseau_serveur_url');
        const secret = this.config.obtenir('reseau_secret');
        if (!serveurUrl || !secret) {
            throw new Error('Poste client local non configuré.');
        }

        return { serveurUrl, secret };
    }

    private async appelerServeurLocal<T = unknown>(serveurUrl: string, secret: string, canal: string, args: unknown[]): Promise<T> {
        try {
            const reponse = await axios.post(
                `${serveurUrl}/api/local/rpc`,
                { canal, args },
                {
                    timeout: 20000,
                    headers: { [SECRET_HEADER]: secret },
                },
            );

            return reponse.data as T;
        } catch (erreur) {
            throw new Error(this.messageErreurConnexion(serveurUrl, erreur));
        }
    }

    private async demarrerServeur(port: number): Promise<void> {
        if (this.serveur && this.portActif === port) return;
        await this.arreterServeur();

        this.serveur = createServer((req, res) => {
            void this.gererRequete(req, res);
        });

        await new Promise<void>((resolve, reject) => {
            this.serveur?.once('error', reject);
            this.serveur?.listen(port, '0.0.0.0', () => {
                this.serveur?.off('error', reject);
                this.portActif = port;
                resolve();
            });
        });
    }

    private async arreterServeur(): Promise<void> {
        const serveur = this.serveur;
        if (!serveur) return;

        await new Promise<void>((resolve) => {
            let termine = false;
            const terminer = () => {
                if (termine) return;
                termine = true;
                clearTimeout(force);
                resolve();
            };
            const force = setTimeout(() => {
                serveur.closeAllConnections?.();
                terminer();
            }, 1_000);

            try {
                serveur.close(terminer);
                serveur.closeIdleConnections?.();
            } catch {
                terminer();
            }
        });
        this.serveur = null;
        this.portActif = null;
    }

    private async gererRequete(req: IncomingMessage, res: ServerResponse): Promise<void> {
        try {
            if (!this.secretValide(req)) {
                this.json(res, 403, { ok: false, erreur: 'Code réseau invalide.' });
                return;
            }

            if (req.method === 'GET' && req.url === '/api/local/status') {
                this.json(res, 200, this.statutServeurLocal());
                return;
            }

            if (req.method === 'POST' && req.url === '/api/local/rpc') {
                const body = await this.lireBody(req);
                const canal = typeof body.canal === 'string' ? body.canal : '';
                const args = Array.isArray(body.args) ? body.args : [];
                const handler = handlers[canal];

                if (!handler) {
                    this.json(res, 404, { ok: false, erreur: 'Action locale inconnue.' });
                    return;
                }

                const resultat = await handler(...(args as never[]));
                this.json(res, 200, resultat);
                return;
            }

            this.json(res, 404, { ok: false, erreur: 'Route locale inconnue.' });
        } catch (erreur) {
            this.json(res, 500, {
                ok: false,
                erreur: erreur instanceof Error ? erreur.message : 'Erreur serveur local.',
            });
        }
    }

    private lireBody(req: IncomingMessage): Promise<Record<string, unknown>> {
        return new Promise((resolve, reject) => {
            let body = '';
            req.on('data', (chunk) => {
                body += chunk;
                if (body.length > 1_000_000) {
                    req.destroy();
                    reject(new Error('Requête locale trop volumineuse.'));
                }
            });
            req.on('end', () => {
                try {
                    resolve(body ? JSON.parse(body) as Record<string, unknown> : {});
                } catch {
                    reject(new Error('JSON local invalide.'));
                }
            });
            req.on('error', reject);
        });
    }

    private json(res: ServerResponse, status: number, payload: unknown): void {
        res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(payload));
    }

    private secretValide(req: IncomingMessage): boolean {
        const secret = this.config.obtenir('reseau_secret');
        const valeur = req.headers[SECRET_HEADER];
        const fourni = Array.isArray(valeur) ? valeur[0] : valeur;

        return !!secret && typeof fourni === 'string' && fourni === secret;
    }

    private mode(): ModeReseauLocal {
        const valeur = this.config.obtenir('reseau_mode');

        return valeur === 'serveur' || valeur === 'client' ? valeur : 'autonome';
    }

    private port(): number {
        const port = Number(this.config.obtenir('reseau_port') ?? PORT_DEFAUT);

        return Number.isFinite(port) && port > 0 ? Math.trunc(port) : PORT_DEFAUT;
    }

    private normaliserUrl(url: string): string {
        const trimmed = url.trim();
        if (!trimmed) return '';

        return (trimmed.startsWith('http://') || trimmed.startsWith('https://') ? trimmed : `http://${trimmed}`).replace(/\/+$/, '');
    }

    private genererSecret(): string {
        return randomBytes(4).toString('hex').toUpperCase();
    }

    private refuserConnexionSurCePoste(url: string): void {
        if (!this.urlPointeSurCePoste(url)) return;

        throw new Error(
            "Cette adresse pointe vers ce même poste. Pour éviter d'utiliser la même base comme serveur et client, utilisez un autre ordinateur du réseau. Pour un test sur une seule machine, lancez une installation/profil séparé avec une base différente.",
        );
    }

    private urlPointeSurCePoste(url: string): boolean {
        try {
            const parsed = new URL(this.normaliserUrl(url));
            const hote = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
            const locaux = new Set(['localhost', '127.0.0.1', '::1']);

            for (const valeurs of Object.values(networkInterfaces())) {
                for (const valeur of valeurs ?? []) {
                    if (valeur.family === 'IPv4' || valeur.family === 'IPv6') {
                        locaux.add(valeur.address.toLowerCase());
                    }
                }
            }

            return locaux.has(hote);
        } catch {
            return false;
        }
    }

    private async recupererStatutServeur(serveurUrl: string, secret: string): Promise<StatutServeurLocal> {
        const url = this.normaliserUrl(serveurUrl);
        if (!url) {
            throw new Error('Adresse de la caisse serveur obligatoire.');
        }

        try {
            const { data } = await axios.get<StatutServeurLocal>(`${url}/api/local/status`, {
                timeout: 5000,
                headers: { [SECRET_HEADER]: secret.trim() },
            });

            return data;
        } catch (erreur) {
            throw new Error(this.messageErreurConnexion(url, erreur));
        }
    }

    private messageErreurConnexion(url: string, erreur: unknown): string {
        if (axios.isAxiosError(erreur)) {
            const status = erreur.response?.status;
            const payload = erreur.response?.data as { erreur?: string; message?: string } | undefined;
            if (status === 403) {
                return payload?.erreur ?? 'Code réseau invalide.';
            }
            if (payload?.erreur || payload?.message) {
                return payload.erreur ?? payload.message ?? 'Réponse serveur invalide.';
            }

            const code = erreur.code ?? '';
            if (code === 'ECONNREFUSED') {
                return `Impossible de joindre la caisse serveur à ${url}. Ouvrez/connectez la machine serveur, activez le mode caisse serveur, puis relancez la synchronisation des données.`;
            }
            if (code === 'ECONNABORTED' || code === 'ETIMEDOUT') {
                return `La caisse serveur à ${url} ne répond pas. Vérifiez le Wi-Fi/réseau local, le pare-feu et relancez la synchronisation des données.`;
            }
            if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
                return `Adresse serveur introuvable : ${url}. Vérifiez l'adresse IP saisie.`;
            }
            if (code === 'ECONNRESET') {
                return `La connexion avec la caisse serveur à ${url} a été coupée. Réessayez après avoir vérifié le serveur.`;
            }
        }

        return `Impossible de contacter la caisse serveur à ${url}.`;
    }

    private statutServeurLocal(): StatutServeurLocal {
        const agence = getDb()
            .prepare(
                `SELECT a.id, a.uuid, a.reference, a.nom, a.ville_id, v.uuid AS ville_uuid, v.nom AS ville_nom,
                        a.adresse, a.telephone
                 FROM agences a
                 JOIN villes v ON v.id = a.ville_id
                 LIMIT 1`,
            )
            .get() as AgenceServeurLocal | undefined;

        return {
            ok: true,
            agence: agence ? `${agence.nom} - ${agence.ville_nom}` : null,
            agenceDetails: agence ?? null,
            compagnie: this.compagnie.actuelle(),
        };
    }

    private enregistrerConfigurationClient(statut: StatutServeurLocal): void {
        const agence = statut.agenceDetails;
        if (!agence) {
            throw new Error("Agence serveur introuvable.");
        }

        const maintenant = new Date().toISOString();
        const db = getDb();

        db.prepare(
            `INSERT OR REPLACE INTO villes (id, uuid, nom, actif, created_at, updated_at)
             VALUES (?, ?, ?, 1, ?, ?)`,
        ).run(agence.ville_id, agence.ville_uuid, agence.ville_nom, maintenant, maintenant);

        db.prepare(
            `INSERT OR REPLACE INTO agences (id, uuid, reference, ville_id, nom, adresse, telephone, actif, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        ).run(
            agence.id,
            agence.uuid,
            agence.reference,
            agence.ville_id,
            agence.nom,
            agence.adresse,
            agence.telephone,
            maintenant,
            maintenant,
        );

        const compagnie: Record<keyof CompagnieLocale, string | null> = statut.compagnie;
        for (const [cle, valeur] of Object.entries(compagnie)) {
            this.config.definir(`compagnie_${cle}`, valeur ?? '');
        }

        this.config.definir('agence_reference', agence.reference);
        this.config.definir('configuree_le', maintenant);
    }

    private adresses(port: number): string[] {
        const interfaces = networkInterfaces();
        const adresses: string[] = [];

        for (const valeurs of Object.values(interfaces)) {
            for (const valeur of valeurs ?? []) {
                if (valeur.family === 'IPv4' && !valeur.internal) {
                    adresses.push(`http://${valeur.address}:${port}`);
                }
            }
        }

        return adresses;
    }
}

export const localNetworkService = new LocalNetworkService();
