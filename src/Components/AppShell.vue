<script setup lang="ts">
import { SidebarProvider } from '@/Components/ui/sidebar';
</script>

<template>
    <SidebarProvider :default-open="true">
        <slot />
    </SidebarProvider>
</template>
