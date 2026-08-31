<script setup lang="ts">
import { RouterView, useRoute } from 'vue-router';
import { computed, onMounted, onUnmounted, watch } from 'vue';
import { useSessionStore } from '@/Stores/session';
import { Toaster } from '@/Components/ui/sonner';

const session = useSessionStore();
const route = useRoute();
const active = computed(() => session.estConnecte && !['/connexion', '/licence', '/configuration'].includes(route.path));
const signaler = () => {
    const presence = window.api?.auth?.presenceSession;
    if (presence) void presence(active.value).catch(() => {});
};
let presenceTimer: ReturnType<typeof setInterval>;
watch(active, signaler);
onMounted(() => { signaler(); presenceTimer = setInterval(signaler, 30000); });
onUnmounted(() => clearInterval(presenceTimer));
</script>

<template>
    <RouterView />
    <Toaster />
</template>
