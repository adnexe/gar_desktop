import { ReferentielRepository } from '../repositories/ReferentielRepository';
import { VoyageRepository, type NouveauVoyage } from '../repositories/VoyageRepository';

export class VoyageService {
    private readonly referentiel = new ReferentielRepository();
    private readonly voyages = new VoyageRepository();

    formulaire(agenceId: number) {
        return {
            itineraires: this.referentiel.itineraires(),
            chauffeurs: this.referentiel.chauffeurs(agenceId),
            vehicules: this.referentiel.vehicules(agenceId),
        };
    }

    creer(donnees: NouveauVoyage) {
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
