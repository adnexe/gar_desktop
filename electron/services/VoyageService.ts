import { ReferentielRepository } from '../repositories/ReferentielRepository';
import { VoyageRepository, type NouveauVoyage } from '../repositories/VoyageRepository';
import { ConfigRepository } from '../repositories/ConfigRepository';

export class VoyageService {
    private readonly referentiel = new ReferentielRepository();
    private readonly voyages = new VoyageRepository();
    private readonly config = new ConfigRepository();

    formulaire(agenceId: number) {
        return {
            itineraires: this.referentiel.itineraires(),
            chauffeurs: this.referentiel.chauffeurs(agenceId),
            vehicules: this.referentiel.vehicules(agenceId),
        };
    }

    creer(donnees: NouveauVoyage) {
        if (this.config.obtenir('reseau_mode') === 'client') {
            throw new Error('VOYAGE_CREATION_POSTE_CLIENT');
        }

        const aujourdHui = new Date().toISOString().slice(0, 10);
        if (donnees.dateDepart < aujourdHui) {
            throw new Error('DATE_VOYAGE_PASSEE');
        }

        return this.voyages.creer(donnees);
    }

    liste(agenceId: number, date?: string) {
        return this.voyages.liste(agenceId, date);
    }

    exporterPourClient(agenceId: number, date?: string | null) {
        return this.voyages.exporterPourClient(agenceId, date);
    }
}
