import { ReferentielRepository } from '../repositories/ReferentielRepository';
import { VoyageRepository, type ModificationVoyage, type NouveauVoyage } from '../repositories/VoyageRepository';
import { ConfigRepository } from '../repositories/ConfigRepository';

export const STATUTS_VOYAGE = ['programme', 'embarquement', 'parti', 'termine', 'annule'] as const;

export class VoyageService {
    private readonly referentiel = new ReferentielRepository();
    private readonly voyages = new VoyageRepository();
    private readonly config = new ConfigRepository();

    formulaire(agenceId: number) {
        return {
            itineraires: this.referentiel.itineraires(agenceId),
            chauffeurs: this.referentiel.chauffeurs(agenceId),
            vehicules: this.referentiel.vehicules(agenceId),
            statuts: STATUTS_VOYAGE,
        };
    }

    // La gestion des voyages (création comme modification) n'est possible
    // que sur le poste qui possède la base de référence (autonome ou
    // serveur) : un poste client doit passer par « Actualiser depuis
    // caisse », sinon ses changements seraient écrasés à la prochaine
    // synchronisation entrante.
    private garantirPosteGestionnaire() {
        if (this.config.obtenir('reseau_mode') === 'client') {
            throw new Error('VOYAGE_GESTION_POSTE_CLIENT');
        }
    }

    creer(donnees: NouveauVoyage) {
        this.garantirPosteGestionnaire();

        const aujourdHui = new Date().toISOString().slice(0, 10);
        if (donnees.dateDepart < aujourdHui) {
            throw new Error('DATE_VOYAGE_PASSEE');
        }

        return this.voyages.creer(donnees);
    }

    details(uuid: string) {
        return this.voyages.parUuid(uuid);
    }

    modifier(uuid: string, donnees: ModificationVoyage) {
        this.garantirPosteGestionnaire();

        const resultat = this.voyages.modifier(uuid, donnees);
        if (!resultat) {
            throw new Error('VOYAGE_INTROUVABLE');
        }

        return resultat;
    }

    liste(agenceId: number, date?: string) {
        return this.voyages.liste(agenceId, date);
    }

    exporterPourClient(agenceId: number, date?: string | null) {
        return this.voyages.exporterPourClient(agenceId, date);
    }
}
