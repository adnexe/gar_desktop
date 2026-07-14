import { ReferentielRepository } from '../repositories/ReferentielRepository';

const repo = new ReferentielRepository();

export const ReferentielController = {
    villes: () => repo.villes(),
    agencesParVille: (villeId: number) => repo.agencesParVille(villeId),
    voyagesDeAgence: (agenceId: number) => repo.voyagesDeAgence(agenceId),
};
