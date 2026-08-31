<script setup lang="ts">
import { useRouter } from 'vue-router';
import { ChevronsUpDown, LogOut, UserRound } from '@lucide/vue';
import { Avatar, AvatarFallback } from '@/Components/ui/avatar';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/Components/ui/dropdown-menu';
import {
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    useSidebar,
} from '@/Components/ui/sidebar';
import { useSessionStore } from '@/Stores/session';

const session = useSessionStore();
const router = useRouter();
const { isMobile, state } = useSidebar();

const initiales = () =>
    session.nom
        .split(' ')
        .filter(Boolean)
        .map((s) => s[0])
        .slice(0, 2)
        .join('')
        .toUpperCase() || '?';

function deconnecter() {
    session.deconnecter();
    router.push({ name: 'connexion' });
}
</script>

<template>
    <SidebarMenu>
        <SidebarMenuItem>
            <DropdownMenu>
                <DropdownMenuTrigger as-child>
                    <SidebarMenuButton
                        size="lg"
                        class="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                    >
                        <Avatar class="size-8 rounded-lg">
                            <AvatarFallback class="rounded-lg">{{ initiales() }}</AvatarFallback>
                        </Avatar>
                        <div class="grid flex-1 text-left text-sm leading-tight">
                            <span class="truncate font-medium">{{ session.nom }}</span>
                            <span class="truncate text-xs text-muted-foreground">{{ session.role }}</span>
                        </div>
                        <ChevronsUpDown class="ml-auto size-4" />
                    </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                    class="w-(--reka-dropdown-menu-trigger-width) min-w-56 rounded-lg"
                    :side="isMobile ? 'bottom' : state === 'collapsed' ? 'left' : 'bottom'"
                    align="end"
                    :side-offset="4"
                >
                    <DropdownMenuLabel class="font-normal">
                        <div class="grid text-left text-sm leading-tight">
                            <span class="truncate font-medium">{{ session.nom }}</span>
                        </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem @click="router.push({ name: 'profil' })">
                        <UserRound />
                        Profil
                    </DropdownMenuItem>
                    <DropdownMenuItem @click="deconnecter">
                        <LogOut />
                        Se déconnecter
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </SidebarMenuItem>
    </SidebarMenu>
</template>
