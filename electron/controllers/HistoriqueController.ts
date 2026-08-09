import { HistoriqueService } from '../services/HistoriqueService';

const service = new HistoriqueService();

export const HistoriqueController = {
    duJour: (agenceId: number, userId?: number | null) => service.duJour(agenceId, userId),
};
