import { SyncQueueRepository, type OperationSync } from '../repositories/SyncQueueRepository';
import { eventBus } from './EventBus';

// Point d'entrée unique utilisé par les repositories d'écriture (tickets,
// bagages, courriers, voyages) pour journaliser chaque opération locale.
// Le SyncEngine (étape suivante) viendra consommer cette file.
export class QueueManager {
    private readonly repo = new SyncQueueRepository();

    ajouter(entite: string, entiteUuid: string, payload: unknown, operation: OperationSync = 'create'): void {
        this.repo.empiler(entite, entiteUuid, operation, payload);
        eventBus.emettre('file:ajout', { entite, entiteUuid });
    }

    enAttenteCount(): number {
        return this.repo.compterEnAttente();
    }
}

export const queueManager = new QueueManager();
