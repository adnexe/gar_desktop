<script setup lang="ts">
import AppContent from '@/Components/AppContent.vue';
import AppShell from '@/Components/AppShell.vue';
import AppSidebar from '@/Components/AppSidebar.vue';
import AppSidebarHeader from '@/Components/AppSidebarHeader.vue';

defineProps<{ titre?: string }>();
</script>

<template>
    <AppShell variant="sidebar">
        <AppSidebar />
        <AppContent class="overflow-x-hidden bg-muted/20">
            <AppSidebarHeader :titre="titre" />
            <div class="flex-1 overflow-y-auto p-5 lg:p-6">
                <slot />
            </div>
        </AppContent>
    </AppShell>
</template>
