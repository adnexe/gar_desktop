import { bootstrap as appelBootstrap, reclamerLicence as appelLicence, type LicenceDesktop, type ReponseLicenceDesktop } from '../apiClient';
import { AgenceRepository } from '../repositories/AgenceRepository';
import { CatalogueRepository } from '../repositories/CatalogueRepository';
import { CompagnieRepository } from '../repositories/CompagnieRepository';
import { ConfigRepository } from '../repositories/ConfigRepository';
import { migrer } from '../database/migrate';
import { getDb } from '../database/connection';
import { logger } from '../logger';

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
            agence_id: Number(agenceId),
            date_debut: dateDebut,
            date_expiration: dateExpiration,
            actif: actif !== '0',
            assigned_at: assignedAt || null,
            assigned_device: assignedDevice || null,
            statut,
        };
    }

    async reclamerLicence(reference: string, appareil: string): Promise<ReponseLicenceDesktop> {
        migrer(getDb());

        const licenceLocale = this.licenceActuelle();
        const resultat = await appelLicence(reference, appareil, licenceLocale?.uuid ?? null);

        if (resultat.ok && resultat.licence) {
            this.enregistrerLicence(resultat.licence);
        }

        return resultat;
    }

    async configurer(reference: string, appareil: string) {
        migrer(getDb());

        const licence = await this.reclamerLicence(reference, appareil);
        if (!licence.ok) {
            throw new Error('LICENCE_INDISPONIBLE');
        }

        const donnees = await appelBootstrap(reference, appareil);

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
        migrer(getDb());

        const reference = this.config.obtenir('agence_reference');
        if (!reference) {
            throw new Error('NON_CONFIGUREE');
        }

        const donnees = await appelBootstrap(reference, 'poste-caisse', timeoutMs);

        this.catalogue.seed(donnees);
        this.config.definir('api_token', donnees.token);
        this.config.definir('derniere_actualisation', new Date().toISOString());

        logger.info(`Catalogue actualisé depuis le serveur (agence ${donnees.agence.reference}).`);

        return this.agences.actuelle();
    }

    private enregistrerLicence(licence: LicenceDesktop): void {
        this.config.definir('licence_uuid', licence.uuid);
        this.config.definir('licence_code', licence.code);
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
