import { createRouter, createWebHashHistory } from 'vue-router';
import { useConfigStore } from '@/Stores/config';
import { useSessionStore } from '@/Stores/session';

const moduleParRoute: Record<string, 'ticket' | 'bagage' | 'courrier' | 'courrier_international'> = {
    vente: 'ticket',
    bagages: 'bagage',
    courrier: 'courrier',
    'courrier-international': 'courrier_international',
};
const rolesParRoute: Record<string, string[]> = {
    agents: ['chef_gare', 'super_admin'],
};
// Écrans liés au module ticket (bus) : réglage de l'entreprise, pas de
// l'agent — distinct de moduleParRoute qui vérifie l'accès de l'agent.
const routesModuleTicket = ['voyages', 'tarifs', 'vehicules', 'chauffeurs'];

const router = createRouter({
    history: createWebHashHistory(),
    routes: [
        { path: '/configuration', name: 'configuration', component: () => import('@/Views/ConfigurationInitiale.vue') },
        { path: '/licence', name: 'licence', component: () => import('@/Views/LicenceRequise.vue') },
        { path: '/connexion', name: 'connexion', component: () => import('@/Views/Login.vue') },
        { path: '/', name: 'dashboard', component: () => import('@/Views/Dashboard.vue') },
        { path: '/vente', name: 'vente', component: () => import('@/Views/Vente.vue') },
        { path: '/bagages', name: 'bagages', component: () => import('@/Views/Bagages.vue') },
        { path: '/courrier', name: 'courrier', component: () => import('@/Views/Courrier.vue') },
        { path: '/courrier-international', name: 'courrier-international', component: () => import('@/Views/CourrierInternational.vue') },
        { path: '/voyages', name: 'voyages', component: () => import('@/Views/Voyages.vue') },
        { path: '/tarifs', name: 'tarifs', component: () => import('@/Views/Tarifs.vue') },
        { path: '/vehicules', name: 'vehicules', component: () => import('@/Views/Vehicules.vue') },
        { path: '/chauffeurs', name: 'chauffeurs', component: () => import('@/Views/Chauffeurs.vue') },
        { path: '/agents', name: 'agents', component: () => import('@/Views/Agents.vue') },
        { path: '/historique', name: 'historique', component: () => import('@/Views/Historique.vue') },
        { path: '/parametres', name: 'parametres', component: () => import('@/Views/Parametres.vue') },
    ],
});

router.beforeEach(async (to) => {
    const config = useConfigStore();
    if (config.configuree === null) {
        await config.charger();
    } else if (config.configuree) {
        // La licence peut avoir été invalidée — ou le poste réinitialisé
        // (agence supprimée) — en arrière-plan : on relit l'état local
        // à chaque navigation.
        await config.rafraichirEtat();
    }

    if (!config.configuree && to.name !== 'configuration') {
        return { name: 'configuration' };
    }
    if (config.configuree && to.name === 'configuration') {
        return { name: 'connexion' };
    }
    if (config.configuree && !config.licenceValide && to.name !== 'licence') {
        return { name: 'licence' };
    }
    if (config.configuree && config.licenceValide && to.name === 'licence') {
        return { name: 'connexion' };
    }

    const session = useSessionStore();
    if (config.configuree && to.name !== 'connexion' && to.name !== 'licence' && !session.estConnecte) {
        return { name: 'connexion' };
    }

    if (typeof to.name === 'string' && moduleParRoute[to.name]) {
        const module = moduleParRoute[to.name];
        if (!session.peutModule(module) || !config.moduleActif(module)) {
            return { name: 'dashboard' };
        }
    }
    if (typeof to.name === 'string' && routesModuleTicket.includes(to.name) && !config.moduleActif('ticket')) {
        return { name: 'dashboard' };
    }
    if (typeof to.name === 'string' && rolesParRoute[to.name] && !rolesParRoute[to.name].includes(session.role)) {
        return { name: 'dashboard' };
    }

    return true;
});

export default router;
