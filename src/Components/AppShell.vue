<script setup lang="ts">
import { SidebarProvider } from '@/Components/ui/sidebar';
</script>

<template>
    <SidebarProvider :default-open="true" class="h-svh min-h-0 overflow-hidden">
        <slot />
    </SidebarProvider>
</template>
