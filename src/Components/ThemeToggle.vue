<script setup lang="ts">
import { Moon, Sun } from '@lucide/vue';
import { Button } from '@/Components/ui/button';
import { useAppearance } from '@/composables/useAppearance';

const { resolvedAppearance, updateAppearance } = useAppearance();

function basculer() {
    updateAppearance(resolvedAppearance.value === 'dark' ? 'light' : 'dark');
}
</script>

<template>
    <Button
        variant="ghost"
        size="icon"
        :aria-label="resolvedAppearance === 'dark' ? 'Passer en mode clair' : 'Passer en mode sombre'"
        :title="resolvedAppearance === 'dark' ? 'Mode clair' : 'Mode sombre'"
        @click="basculer"
    >
        <Sun v-if="resolvedAppearance === 'dark'" />
        <Moon v-else />
    </Button>
</template>
