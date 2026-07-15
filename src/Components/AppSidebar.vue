<script setup lang="ts">
import { RouterLink } from 'vue-router';
import { Bus, Car, History, LayoutGrid, Luggage, Mail, Settings, Tags, Ticket, Users } from '@lucide/vue';
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
import { useSessionStore } from '@/Stores/session';
import type { NavItem } from '@/types';

const session = useSessionStore();

const mainNavItems = computed<NavItem[]>(() => {
    const items: NavItem[] = [{ title: 'Tableau de bord', routeName: 'dashboard', icon: LayoutGrid }];

    if (session.peutModule('ticket')) items.push({ title: 'Vente de tickets', routeName: 'vente', icon: Ticket });
    if (session.peutModule('bagage')) items.push({ title: 'Bagages', routeName: 'bagages', icon: Luggage });
    if (session.peutModule('courrier')) items.push({ title: 'Courrier', routeName: 'courrier', icon: Mail });

    return items;
});

const exploitationNavItems: NavItem[] = [
    { title: 'Voyages', routeName: 'voyages', icon: Bus },
    { title: 'Tarifs', routeName: 'tarifs', icon: Tags },
    { title: 'Véhicules', routeName: 'vehicules', icon: Car },
    { title: 'Chauffeurs', routeName: 'chauffeurs', icon: Users },
    { title: 'Historique', routeName: 'historique', icon: History },
    { title: 'Paramètres', routeName: 'parametres', icon: Settings },
];
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
