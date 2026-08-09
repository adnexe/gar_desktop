<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import AppContent from '@/Components/AppContent.vue';
import AppShell from '@/Components/AppShell.vue';
import AppSidebar from '@/Components/AppSidebar.vue';
import AppSidebarHeader from '@/Components/AppSidebarHeader.vue';
import { useConfigStore } from '@/Stores/config';
import { useSessionStore } from '@/Stores/session';

defineProps<{ titre?: string }>();

const router = useRouter();
const config = useConfigStore();
const session = useSessionStore();
let intervalleVerification: ReturnType<typeof setInterval> | null = null;

async function verifierSessionSilencieusement() {
    if (!session.userId) return;

    try {
        await config.charger();
        if (!config.licenceValide) {
            session.deconnecter();
            await router.replace({ name: 'licence' });
            return;
        }

        const resultat = await window.api.auth.verifierSession(session.userId);
        if (!resultat.ok) {
            session.deconnecter();
            await router.replace({ name: 'connexion' });
        }
    } catch {
        // Hors-ligne ou IPC temporairement indisponible : on ne coupe pas
        // une session valide tant qu'il n'y a pas de réponse ferme locale.
    }
}

onMounted(() => {
    void verifierSessionSilencieusement();
    intervalleVerification = setInterval(() => {
        void verifierSessionSilencieusement();
    }, 60_000);
});

onUnmounted(() => {
    if (intervalleVerification) {
        clearInterval(intervalleVerification);
    }
});
</script>

<template>
    <AppShell variant="sidebar">
        <AppSidebar />
        <AppContent class="h-full min-h-0 overflow-hidden bg-muted/20">
            <AppSidebarHeader :titre="titre" />
            <div class="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-5 lg:p-6">
                <slot />
            </div>
        </AppContent>
    </AppShell>
</template>
