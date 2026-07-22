<script setup lang="ts">
import { computed } from 'vue';
import { Feather, Heart, Leaf, Moon, Sparkles, Sun, Sunset } from '@lucide/vue';
import { Button } from '@/Components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/Components/ui/dropdown-menu';
import { useAppearance } from '@/composables/useAppearance';
import type { ResolvedAppearance } from '@/types';

const { resolvedAppearance, updateAppearance } = useAppearance();

const themes: { valeur: ResolvedAppearance; libelle: string; icone: object }[] = [
    { valeur: 'light', libelle: 'Clair', icone: Sun },
    { valeur: 'dark', libelle: 'Sombre', icone: Moon },
    { valeur: 'feminin', libelle: 'Féminin', icone: Heart },
    { valeur: 'universel', libelle: 'Universel', icone: Sparkles },
    { valeur: 'emeraude', libelle: 'Émeraude', icone: Leaf },
    { valeur: 'ambre', libelle: 'Ambre', icone: Sunset },
    { valeur: 'doux', libelle: 'Doux', icone: Feather },
];

const icone = computed(() => themes.find((t) => t.valeur === resolvedAppearance.value)?.icone ?? Sun);
</script>

<template>
    <DropdownMenu>
        <DropdownMenuTrigger as-child>
            <Button variant="ghost" size="icon" title="Changer de thème" aria-label="Changer de thème">
                <component :is="icone" />
            </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
            <DropdownMenuItem
                v-for="theme in themes"
                :key="theme.valeur"
                :class="resolvedAppearance === theme.valeur && 'bg-accent text-accent-foreground'"
                @click="updateAppearance(theme.valeur)"
            >
                <component :is="theme.icone" />
                {{ theme.libelle }}
            </DropdownMenuItem>
        </DropdownMenuContent>
    </DropdownMenu>
</template>
