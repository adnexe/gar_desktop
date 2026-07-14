import { EventEmitter } from 'node:events';

export type EvenementSync = 'sync:demarree' | 'sync:terminee' | 'sync:erreur' | 'file:ajout';

class EventBus extends EventEmitter {
    emettre(evenement: EvenementSync, donnees?: unknown): void {
        this.emit(evenement, donnees);
    }

    ecouter(evenement: EvenementSync, gestionnaire: (donnees?: unknown) => void): void {
        this.on(evenement, gestionnaire);
    }
}

export const eventBus = new EventBus();
