import { BagageRepository } from '../repositories/BagageRepository';
import { CourrierRepository } from '../repositories/CourrierRepository';
import { TicketRepository } from '../repositories/TicketRepository';

export class HistoriqueService {
    private readonly tickets = new TicketRepository();
    private readonly bagages = new BagageRepository();
    private readonly courriers = new CourrierRepository();

    duJour(agenceId: number) {
        return {
            tickets: this.tickets.ventesDuJour(agenceId),
            bagages: this.bagages.duJour(agenceId),
            courriers: this.courriers.duJour(agenceId),
        };
    }
}
