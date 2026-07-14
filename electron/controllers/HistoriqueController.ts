import { HistoriqueService } from '../services/HistoriqueService';

const service = new HistoriqueService();

export const HistoriqueController = {
    duJour: (agenceId: number) => service.duJour(agenceId),
};
