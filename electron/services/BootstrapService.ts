import axios from 'axios';
import { bootstrap as appelBootstrap, reclamerLicence as appelLicence, type LicenceDesktop, type ReponseLicenceDesktop } from '../apiClient';
import { AgenceRepository } from '../repositories/AgenceRepository';
import { CatalogueRepository } from '../repositories/CatalogueRepository';
import { CompagnieRepository } from '../repositories/CompagnieRepository';
import { ConfigRepository } from '../repositories/ConfigRepository';
import { migrer } from '../database/migrate';
import { getDb } from '../database/connection';
import { logger } from '../logger';
import { avecVerrouComptes } from './CompteSyncLock';

// Statuts renvoyés par le serveur qui doivent bloquer le poste (par
// opposition à une simple panne réseau, qui ne bloque jamais).
const STATUTS_LICENCE_BLOQUANTS = ['expiree', 'desactivee', 'aucune_licence', 'inexistante', 'agence_desactivee'];

// bootstrap() (contrairement à reclamerLicence()) laisse axios lever une
// exception sur tout code non-2xx : un 429 (trop de tentatives) ou un 500
// remontait donc jusqu'à l'écran de config comme "agence introuvable ou
// pas de connexion", un message faux qui égare l'utilisateur. On distingue
// ici la vraie cause pour renvoyer un message exploitable.
function messageErreurBootstrap(erreur: unknown): string {
    if (axios.isAxiosError(erreur)) {
        if (!erreur.response) {
            return 'Pas de connexion internet pour ce premier réglage.';
        }

        const status = erreur.response.status;
        const donnees = erreur.response.data as { message?: string } | undefined;

        if (status === 429) {
            const retryAfter = erreur.response.headers?.['retry-after'];
            return retryAfter
                ? `Trop de tentatives : réessaie dans ${retryAfter} seconde(s).`
                : 'Trop de tentatives : réessaie dans quelques instants.';
        }

        if (status === 404) {
            return donnees?.message ?? 'Référence agence introuvable ou agence désactivée.';
        }

        return donnees?.message ?? `Le serveur a refusé la demande (code ${status}).`;
    }

    return 'Une erreur inattendue est survenue.';
}

export class BootstrapService {
    private readonly config = new ConfigRepository();
    private readonly catalogue = new CatalogueRepository();
    private readonly agences = new AgenceRepository();
    private readonly compagnie = new CompagnieRepository();

    estConfiguree(): boolean {
        migrer(getDb());
        return this.config.estConfiguree();
    }

    agenceActuelle() {
        return this.agences.actuelle();
    }

    compagnieActuelle() {
        return this.compagnie.actuelle();
    }

    licenceActuelle(): LicenceDesktop | null {
        const uuid = this.config.obtenir('licence_uuid');
        const code = this.config.obtenir('licence_code');
        const codePoste = this.config.obtenir('licence_code_poste');
        const agenceId = this.config.obtenir('licence_agence_id');
        const dateDebut = this.config.obtenir('licence_date_debut');
        const dateExpiration = this.config.obtenir('licence_date_expiration');
        const actif = this.config.obtenir('licence_actif');
        const assignedAt = this.config.obtenir('licence_assigned_at');
        const assignedDevice = this.config.obtenir('licence_assigned_device');
        const statut = this.config.obtenir('licence_statut');

        if (!uuid || !code || !agenceId || !dateDebut || !dateExpiration || !statut) {
            return null;
        }

        return {
            uuid,
            code,
            code_poste: codePoste || null,
            agence_id: Number(agenceId),
            date_debut: dateDebut,
            date_expiration: dateExpiration,
            actif: actif !== '0',
            assigned_at: assignedAt || null,
            assigned_device: assignedDevice || null,
            statut,
        };
    }

    async reclamerLicence(reference: string, appareil: string, codePoste?: string | null): Promise<ReponseLicenceDesktop> {
        migrer(getDb());

        const licenceLocale = this.licenceActuelle();
        const resultat = await appelLicence(reference, appareil, licenceLocale?.uuid ?? null, codePoste ?? licenceLocale?.code_poste ?? null);

        if (resultat.ok && resultat.licence) {
            this.enregistrerLicence(resultat.licence);
        } else if (resultat.statut === 'agence_inexistante') {
            // L'agence a été supprimée côté admin : les données locales sont
            // orphelines (aucune synchro possible). On remet le poste à zéro,
            // il redemandera une référence d'agence à l'écran de configuration.
            this.reinitialiserPoste();
        } else if (STATUTS_LICENCE_BLOQUANTS.includes(resultat.statut ?? '')) {
            // Réponse ferme du serveur (et non une panne réseau) : la licence
            // est expirée/désactivée/supprimée côté admin. On PERSISTE
            // l'invalidation — sinon un simple redémarrage hors-ligne
            // rechargerait la licence locale intacte et débloquerait le poste.
            this.invaliderLicenceLocale(resultat.statut ?? 'aucune_licence');
        }

        return resultat;
    }

    /**
     * Revérifie la licence auprès du serveur (au lancement, à la connexion et
     * périodiquement dès qu'un réseau est disponible). Passe par `reclamer` :
     * le serveur rafraîchit l'état réel (expirée, désactivée, supprimée) et
     * assigne automatiquement une nouvelle licence si l'admin en a créé une.
     * Hors-ligne : silencieux, la licence locale reste la référence.
     */
    async verifierLicenceEnLigne(): Promise<void> {
        try {
            migrer(getDb());

            const reference = this.config.obtenir('agence_reference');
            if (!reference) return;

            const resultat = await this.reclamerLicence(reference, 'poste-caisse');
            if (!resultat.ok) {
                logger.warn(`Licence refusée par le serveur (statut: ${resultat.statut ?? 'inconnu'}).`);
            }
        } catch {
            // Serveur injoignable : on ne bloque pas le poste pour autant.
        }
    }

    /**
     * Vide toute la base locale (catalogue, opérations, config, licence) en
     * conservant le schéma. Appelée UNIQUEMENT sur réponse ferme du serveur
     * « agence inexistante » — jamais sur une panne réseau.
     */
    private reinitialiserPoste(): void {
        const db = getDb();
        const adminUrl = this.config.obtenir('admin_url');
        const tables = db
            .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT IN ('migrations', 'sqlite_sequence')")
            .all() as { name: string }[];

        db.pragma('foreign_keys = OFF');
        try {
            const vider = db.transaction(() => {
                for (const table of tables) {
                    db.prepare(`DELETE FROM "${table.name}"`).run();
                }
                if (adminUrl) this.config.definir('admin_url', adminUrl);
            });
            vider();
        } finally {
            db.pragma('foreign_keys = ON');
        }

        logger.warn('Agence supprimée côté serveur : poste réinitialisé, reconfiguration requise.');
    }

    private invaliderLicenceLocale(statut: string): void {
        this.config.definir('licence_actif', '0');
        this.config.definir('licence_statut', statut);
        this.config.definir('licence_derniere_verification', new Date().toISOString());
        logger.warn(`Licence locale invalidée (${statut}).`);
    }

    async configurer(reference: string, appareil: string, codePoste?: string | null) {
        return avecVerrouComptes(() => this.configurerCatalogue(reference, appareil, codePoste));
    }

    private async configurerCatalogue(reference: string, appareil: string, codePoste?: string | null) {
        migrer(getDb());

        const licence = await this.reclamerLicence(reference, appareil, codePoste);
        if (!licence.ok) {
            throw new Error('LICENCE_INDISPONIBLE');
        }

        let donnees;
        try {
            donnees = await appelBootstrap(reference, appareil);
        } catch (erreur) {
            throw new Error(messageErreurBootstrap(erreur));
        }

        this.catalogue.seed(donnees);
        this.config.definir('agence_reference', donnees.agence.reference);
        this.config.definir('api_token', donnees.token);
        this.config.definir('configuree_le', new Date().toISOString());

        logger.info(`App configurée pour l'agence ${donnees.agence.nom} (${donnees.agence.reference}).`);

        return this.agences.actuelle();
    }

    /**
     * Re-télécharge le catalogue depuis le serveur (villes, trajets, tarifs,
     * agents, comptes...) pour prendre en compte les changements faits côté
     * admin — ex. un accès modifié ou une caissière désactivée. Appelée
     * automatiquement au lancement et via le bouton « Actualiser » du login.
     * Nécessite une connexion : l'échec est laissé à l'appelant (l'app
     * continue de fonctionner avec les données locales).
     */
    async actualiser(timeoutMs?: number) {
        return avecVerrouComptes(() => this.actualiserCatalogue(timeoutMs));
    }

    private async actualiserCatalogue(timeoutMs?: number) {
        migrer(getDb());

        const reference = this.config.obtenir('agence_reference');
        if (!reference) {
            throw new Error('NON_CONFIGUREE');
        }

        let donnees;
        try {
            donnees = await appelBootstrap(reference, 'poste-caisse', timeoutMs);
        } catch (erreur) {
            throw new Error(messageErreurBootstrap(erreur));
        }

        this.catalogue.seed(donnees);
        this.config.definir('api_token', donnees.token);
        this.config.definir('derniere_actualisation', new Date().toISOString());

        logger.info(`Catalogue actualisé depuis le serveur (agence ${donnees.agence.reference}).`);

        return this.agences.actuelle();
    }

    private enregistrerLicence(licence: LicenceDesktop): void {
        this.config.definir('licence_uuid', licence.uuid);
        this.config.definir('licence_code', licence.code);
        this.config.definir('licence_code_poste', licence.code_poste ?? '');
        this.config.definir('licence_agence_id', String(licence.agence_id));
        this.config.definir('licence_date_debut', licence.date_debut);
        this.config.definir('licence_date_expiration', licence.date_expiration);
        this.config.definir('licence_actif', licence.actif ? '1' : '0');
        this.config.definir('licence_assigned_at', licence.assigned_at ?? '');
        this.config.definir('licence_assigned_device', licence.assigned_device ?? '');
        this.config.definir('licence_statut', licence.statut);
        this.config.definir('licence_derniere_verification', new Date().toISOString());
    }
}
