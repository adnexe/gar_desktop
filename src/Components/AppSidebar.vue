<script setup lang="ts">
import { RouterLink } from 'vue-router';
import { Bus, Car, Globe2, History, LayoutGrid, Luggage, Mail, Settings, Tags, Ticket, UserCog, Users } from '@lucide/vue';
import { computed } from 'vue';
import AppLogo from '@/Components/AppLogo.vue';
import NavMain from '@/Components/NavMain.vue';
import NavUser from '@/Components/NavUser.vue';
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
} from '@/Components/ui/sidebar';
import { useConfigStore } from '@/Stores/config';
import { useSessionStore } from '@/Stores/session';
import type { NavItem } from '@/types';

const session = useSessionStore();
const config = useConfigStore();

const mainNavItems = computed<NavItem[]>(() => {
    const items: NavItem[] = [{ title: 'Tableau de bord', routeName: 'dashboard', icon: LayoutGrid }];

    if (session.peutModule('ticket') && config.moduleActif('ticket')) items.push({ title: 'Vente de tickets', routeName: 'vente', icon: Ticket });
    if (session.peutModule('bagage') && config.moduleActif('bagage')) items.push({ title: 'Bagages', routeName: 'bagages', icon: Luggage });
    if (session.peutModule('courrier') && config.moduleActif('courrier')) items.push({ title: 'Courrier', routeName: 'courrier', icon: Mail });
    if (session.peutModule('courrier_international') && config.moduleActif('courrier_international')) items.push({ title: 'Courrier international', routeName: 'courrier-international', icon: Globe2 });

    return items;
});

// Voyages/Tarifs/Véhicules/Chauffeurs ne servent qu'au module ticket (bus) :
// masqués si l'entreprise n'utilise pas ce module (réglage compagnie, pas
// une question d'accès de l'agent).
const exploitationNavItems = computed<NavItem[]>(() => {
    const items: NavItem[] = [];

    if (config.moduleActif('ticket')) {
        items.push(
            { title: 'Voyages', routeName: 'voyages', icon: Bus },
            { title: 'Tarifs', routeName: 'tarifs', icon: Tags },
            { title: 'Véhicules', routeName: 'vehicules', icon: Car },
            { title: 'Chauffeurs', routeName: 'chauffeurs', icon: Users },
        );
    }

    if (['chef_gare', 'super_admin'].includes(session.role)) {
        items.push({ title: 'Agents', routeName: 'agents', icon: UserCog });
    }

    items.push(
        { title: 'Historique', routeName: 'historique', icon: History },
        { title: 'Paramètres', routeName: 'parametres', icon: Settings },
    );

    return items;
});
</script>

<template>
    <Sidebar collapsible="icon" variant="inset">
        <SidebarHeader>
            <SidebarMenu>
                <SidebarMenuItem>
                    <SidebarMenuButton size="lg" as-child>
                        <RouterLink :to="{ name: 'dashboard' }">
                            <AppLogo />
                        </RouterLink>
                    </SidebarMenuButton>
                </SidebarMenuItem>
            </SidebarMenu>
        </SidebarHeader>

        <SidebarContent>
            <NavMain :items="mainNavItems" />
            <NavMain label="Exploitation" :items="exploitationNavItems" />
        </SidebarContent>

        <SidebarFooter>
            <NavUser />
        </SidebarFooter>
    </Sidebar>
    <slot />
</template>
