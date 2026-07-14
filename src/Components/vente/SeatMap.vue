<script setup lang="ts">
import { computed } from 'vue';
import { cn } from '@/lib/utils';

const props = defineProps<{
    nombrePlaces: number;
    placesOccupees: number[];
    placeSelectionnee: number | null;
}>();

const emit = defineEmits<{
    select: [place: number];
}>();

const places = computed(() => Array.from({ length: props.nombrePlaces }, (_, i) => i + 1));

// Rangées de 4 places (2 + allée + 2), disposition générique.
const rangees = computed(() => {
    const result: number[][] = [];

    for (let i = 0; i < places.value.length; i += 4) {
        result.push(places.value.slice(i, i + 4));
    }

    return result;
});

const statut = (place: number): 'occupee' | 'selectionnee' | 'libre' => {
    if (props.placesOccupees.includes(place)) return 'occupee';
    if (place === props.placeSelectionnee) return 'selectionnee';
    return 'libre';
};

const classesFor = (place: number) => {
    const s = statut(place);

    return cn(
        'flex size-10 items-center justify-center rounded-md border text-xs font-medium transition-colors',
        s === 'occupee' && 'cursor-not-allowed border-destructive/30 bg-destructive/15 text-destructive',
        s === 'selectionnee' && 'border-emerald-600 bg-emerald-500 text-white',
        s === 'libre' && 'cursor-pointer border-muted-foreground/20 bg-muted/40 text-muted-foreground hover:border-primary hover:text-foreground',
    );
};

const choisir = (place: number) => {
    if (statut(place) === 'occupee') return;
    emit('select', place);
};
</script>

<template>
    <div class="space-y-3">
        <div class="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <span class="flex items-center gap-1.5">
                <span class="size-3 rounded border border-destructive/30 bg-destructive/15" />
                Occupée
            </span>
            <span class="flex items-center gap-1.5">
                <span class="size-3 rounded border border-emerald-600 bg-emerald-500" />
                Sélectionnée
            </span>
            <span class="flex items-center gap-1.5">
                <span class="size-3 rounded border border-muted-foreground/20 bg-muted/40" />
                Libre
            </span>
        </div>

        <div class="space-y-2">
            <div v-for="(rangee, index) in rangees" :key="index" class="flex items-center gap-2">
                <div class="flex gap-2">
                    <div
                        v-for="place in rangee.slice(0, 2)"
                        :key="place"
                        :class="classesFor(place)"
                        role="button"
                        :aria-disabled="statut(place) === 'occupee'"
                        @click="choisir(place)"
                    >
                        {{ place }}
                    </div>
                </div>
                <div class="w-6" />
                <div class="flex gap-2">
                    <div
                        v-for="place in rangee.slice(2, 4)"
                        :key="place"
                        :class="classesFor(place)"
                        role="button"
                        :aria-disabled="statut(place) === 'occupee'"
                        @click="choisir(place)"
                    >
                        {{ place }}
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
