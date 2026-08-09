<script setup lang="ts">
import { computed } from 'vue';
import { Blinds } from '@lucide/vue';
import { cn } from '@/lib/utils';

const props = defineProps<{
    nombrePlaces: number;
    /** "3-2" (3 sièges à gauche de l'allée, 2 à droite) ou "2-2". Absente ou
     * inconnue → plan générique 2+2 (comportement historique). */
    disposition: string | null;
    placesOccupees: number[];
    placeSelectionnee: number | null;
}>();

const emit = defineEmits<{
    select: [place: number];
}>();

// Taille de chaque bloc (gauche = côté chauffeur, droite = de l'autre côté
// de l'allée) selon la disposition réelle du véhicule.
const DISPOSITIONS: Record<string, { gauche: number; droite: number }> = {
    '3-2': { gauche: 3, droite: 2 },
    '2-2': { gauche: 2, droite: 2 },
};

const config = computed(() => (props.disposition && DISPOSITIONS[props.disposition]) || DISPOSITIONS['2-2']);
const tailleRangee = computed(() => config.value.gauche + config.value.droite);

type Siege = { place: number; fenetre: boolean };

// Numérotation confirmée sur le terrain (fiche de réservation papier) : dans
// chaque rangée, le n° 1 est le siège fenêtre du bloc de droite, les numéros
// augmentent en allant vers la fenêtre du bloc de gauche. Rangée suivante :
// on continue (ex. 3-2 → rangée 1 = 1..5, rangée 2 = 6..10, ...).
// Position dans la rangée (1 = fenêtre droite … tailleRangee = fenêtre
// gauche) : seules la 1ère et la dernière position sont côté fenêtre, tout
// le reste est côté allée.
const rangees = computed(() => {
    const R = tailleRangee.value;
    const result: { gauche: (Siege | null)[]; droite: (Siege | null)[] }[] = [];

    for (let debut = 1; debut <= props.nombrePlaces; debut += R) {
        const gauche: (Siege | null)[] = [];
        const droite: (Siege | null)[] = [];

        // Ordre d'affichage : bloc gauche de la fenêtre vers l'allée, puis
        // bloc droite de l'allée vers la fenêtre — comme sur la fiche papier.
        // Sur la dernière rangée (incomplète si nombrePlaces n'est pas un
        // multiple de R), les places manquantes deviennent `null` mais
        // gardent leur emplacement : sans ça, un bloc gauche entièrement vide
        // s'effondre en largeur et décale tout le bloc droite vers la gauche.
        for (let pos = R; pos >= 1; pos--) {
            const place = debut + pos - 1;
            const siege: Siege | null = place <= props.nombrePlaces
                ? { place, fenetre: pos === 1 || pos === R }
                : null;

            if (pos > config.value.droite) gauche.push(siege);
            else droite.push(siege);
        }

        result.push({ gauche, droite });
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
        'relative flex size-11 items-center justify-center rounded-md border text-xs font-medium transition-colors',
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
            <span class="flex items-center gap-1.5">
                <Blinds class="size-3.5" />
                Côté fenêtre
            </span>
        </div>

        <div class="space-y-2">
            <div v-for="(rangee, index) in rangees" :key="index" class="flex items-center gap-2">
                <div class="flex gap-1.5">
                    <div
                        v-for="(siege, i) in rangee.gauche"
                        :key="siege ? siege.place : `g${index}-${i}`"
                        :class="siege ? classesFor(siege.place) : 'size-11'"
                        :role="siege ? 'button' : undefined"
                        :aria-disabled="siege ? statut(siege.place) === 'occupee' : undefined"
                        @click="siege && choisir(siege.place)"
                    >
                        <template v-if="siege">
                            <Blinds v-if="siege.fenetre" class="absolute top-0.5 left-0.5 size-2.5 opacity-60" />
                            <span class="absolute top-0.5 right-1 text-[10px] leading-none">{{ siege.place }}</span>
                        </template>
                    </div>
                </div>
                <div class="w-5" />
                <div class="flex gap-1.5">
                    <div
                        v-for="(siege, i) in rangee.droite"
                        :key="siege ? siege.place : `d${index}-${i}`"
                        :class="siege ? classesFor(siege.place) : 'size-11'"
                        :role="siege ? 'button' : undefined"
                        :aria-disabled="siege ? statut(siege.place) === 'occupee' : undefined"
                        @click="siege && choisir(siege.place)"
                    >
                        <template v-if="siege">
                            <Blinds v-if="siege.fenetre" class="absolute top-0.5 left-0.5 size-2.5 opacity-60" />
                            <span class="absolute top-0.5 right-1 text-[10px] leading-none">{{ siege.place }}</span>
                        </template>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
