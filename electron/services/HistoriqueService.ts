import { BagageRepository } from '../repositories/BagageRepository';
import { CourrierRepository } from '../repositories/CourrierRepository';
import { TicketRepository } from '../repositories/TicketRepository';

export class HistoriqueService {
    private readonly tickets = new TicketRepository();
    private readonly bagages = new BagageRepository();
    private readonly courriers = new CourrierRepository();

    // userId null = tout voir (admin / chef de gare) ; sinon uniquement les
    // opérations de cet utilisateur (agents).
    duJour(agenceId: number, userId?: number | null) {
        return {
            tickets: this.tickets.ventesDuJour(agenceId, undefined, userId),
            bagages: this.bagages.duJour(agenceId, undefined, userId),
            courriers: this.courriers.duJour(agenceId, undefined, userId),
        };
    }
}
