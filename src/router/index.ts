import { createRouter, createWebHashHistory } from 'vue-router';
import { useConfigStore } from '@/Stores/config';
import { useSessionStore } from '@/Stores/session';

const moduleParRoute: Record<string, 'ticket' | 'bagage' | 'courrier'> = {
    vente: 'ticket',
    bagages: 'bagage',
    courrier: 'courrier',
};

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
        { path: '/voyages', name: 'voyages', component: () => import('@/Views/Voyages.vue') },
        { path: '/historique', name: 'historique', component: () => import('@/Views/Historique.vue') },
        { path: '/parametres', name: 'parametres', component: () => import('@/Views/Parametres.vue') },
    ],
});

router.beforeEach(async (to) => {
    const config = useConfigStore();
    if (config.configuree === null) {
        await config.charger();
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

    if (typeof to.name === 'string' && moduleParRoute[to.name] && !session.peutModule(moduleParRoute[to.name])) {
        return { name: 'dashboard' };
    }

    return true;
});

export default router;
