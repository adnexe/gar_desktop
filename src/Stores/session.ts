import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export interface DonneesSession {
    userId: number;
    uuid: string;
    nom: string;
    role: string;
    agentId: number | null;
    agentRole: string | null;
    agenceId: number | null;
    typeAgent: string[];
}

export const useSessionStore = defineStore('session', () => {
    const userId = ref<number | null>(null);
    const uuid = ref('');
    const nom = ref('');
    const role = ref('');
    const agentId = ref<number | null>(null);
    const agentRole = ref<string | null>(null);
    const agenceId = ref<number | null>(null);
    const typeAgent = ref<string[]>([]);

    const estConnecte = computed(() => userId.value !== null);
    const estAdminLevel = computed(() => ['super_admin', 'admin'].includes(role.value));
    const peutModule = (module: 'ticket' | 'bagage' | 'courrier' | 'courrier_international') =>
        estAdminLevel.value || role.value === 'chef_gare' || typeAgent.value.includes(module);

    function definir(session: DonneesSession) {
        userId.value = session.userId;
        uuid.value = session.uuid;
        nom.value = session.nom;
        role.value = session.role;
        agentId.value = session.agentId;
        agentRole.value = session.agentRole;
        agenceId.value = session.agenceId;
        typeAgent.value = session.typeAgent;
    }

    function deconnecter() {
        userId.value = null;
        uuid.value = '';
        nom.value = '';
        role.value = '';
        agentId.value = null;
        agentRole.value = null;
        agenceId.value = null;
        typeAgent.value = [];
    }

    return { userId, uuid, nom, role, agentId, agentRole, agenceId, typeAgent, estConnecte, estAdminLevel, peutModule, definir, deconnecter };
});
