<script setup lang="ts">
import { computed } from 'vue';
import type { AgenceLocale, CompagnieLocale } from '@/Stores/config';
import type { Convoi } from '@/types/convoi';

const props = defineProps<{ convoi: Convoi; agence: AgenceLocale | null; compagnie: CompagnieLocale | null }>();
const logo = computed(() => props.compagnie?.logo_data_uri || props.compagnie?.logo_url || null);
const pages = computed(() => {
    const taillePage = 23;
    const nombrePages = Math.ceil(props.convoi.nombre_places / taillePage);
    return Array.from({ length: nombrePages }, (_, index) => {
        const debut = index * taillePage + 1;
        const fin = Math.min(debut + taillePage - 1, props.convoi.nombre_places);
        return { numero: index + 1, debut, fin, places: Array.from({ length: fin - debut + 1 }, (__, place) => debut + place) };
    });
});
const formatDate = (date: string) => date.split('-').reverse().join('/');
function masquerLogo(event: Event) { (event.currentTarget as HTMLImageElement).style.display = 'none'; }
</script>

<template>
    <div class="zone-impression-a4" aria-hidden="true">
        <article v-for="page in pages" :key="page.numero" class="bordereau-a4 bordereau-convoi convoi-page">
            <header class="bordereau-entete">
                <div class="bordereau-identite">
                    <img v-if="logo" :src="logo" alt="" class="bordereau-logo" @error="masquerLogo">
                    <div><p v-if="compagnie?.nom" class="bordereau-compagnie">{{ compagnie.nom }}</p><h1>Bordereau de convoi</h1><p v-if="agence?.telephone">Tél. {{ agence.telephone }}</p></div>
                </div>
                <div class="bordereau-reference"><span>CONVOI</span><strong>{{ convoi.reference }}</strong></div>
            </header>
            <section class="bordereau-meta convoi-meta">
                <div><span>Agence de départ</span><strong>{{ agence?.nom || convoi.agence }}</strong><small>{{ convoi.ville_depart }}</small></div>
                <div><span>Destination</span><strong>{{ convoi.destination }}</strong><small>{{ convoi.precision_destination }}</small></div>
                <div><span>Départ</span><strong>{{ formatDate(convoi.date_depart) }} à {{ convoi.heure_depart }}</strong></div>
                <div><span>Retour prévu</span><strong>{{ convoi.date_retour ? formatDate(convoi.date_retour) : 'Non précisé' }}<template v-if="convoi.heure_retour"> à {{ convoi.heure_retour }}</template></strong></div>
                <div><span>Places prévues</span><strong>{{ convoi.nombre_places }}</strong></div>
                <div><span>Statut</span><strong>{{ convoi.statut }}</strong></div>
                <div><span>Créé par</span><strong>{{ convoi.cree_par || '—' }}</strong></div>
                <div><span>Page</span><strong>{{ page.numero }} / {{ pages.length }}</strong></div>
            </section>
            <table class="bordereau-table convoi-passagers">
                <thead><tr><th class="col-index">N°</th><th>Nom et prénoms du passager</th><th>Téléphone</th><th>Observation / signature</th></tr></thead>
                <tbody><tr v-for="place in page.places" :key="place"><td>{{ place }}</td><td></td><td></td><td></td></tr></tbody>
            </table>
            <footer class="bordereau-pied"><strong>{{ convoi.nombre_places }} place(s) prévues</strong><span>Lignes {{ page.debut }} à {{ page.fin }}</span></footer>
        </article>
    </div>
</template>

<style scoped>
.convoi-meta { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.convoi-passagers th:first-child, .convoi-passagers td:first-child { width: 10mm; text-align: center; }
.convoi-passagers th:last-child { width: 38mm; }
.convoi-passagers td { height: 9mm; }
.convoi-page { break-after: page; page-break-after: always; }
.convoi-page:last-child { break-after: auto; page-break-after: auto; }
</style>
