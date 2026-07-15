import { AgentService } from '../services/AgentService';

const service = new AgentService();

export const AgentController = {
    lister: (agenceId: number) => service.lister(agenceId),
    desactiver: (agentUuid: string, acteurUserId: number) => service.desactiver(agentUuid, acteurUserId),
    reactiver: (agentUuid: string, acteurUserId: number) => service.reactiver(agentUuid, acteurUserId),
    supprimerLocalement: (agentUuid: string, acteurUserId: number) => service.supprimerLocalement(agentUuid, acteurUserId),
    verifierSession: (userId: number) => service.verifierSession(userId),
};
