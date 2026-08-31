<script setup lang="ts">
import { computed } from 'vue';
import type { AgenceLocale, CompagnieLocale } from '@/Stores/config';
import type { DetailsLot, StatutLot } from '@/types/lot';

const props = defineProps<{
    lot: DetailsLot;
    agence: AgenceLocale | null;
    compagnie: CompagnieLocale | null;
}>();

const titreType = computed(() => props.lot.type === 'courrier'
    ? 'Lot de livraison'
    : props.lot.type === 'courrier_international' ? 'Lot international' : 'Lot de bagages');
const logoSrc = computed(() => props.compagnie?.logo_data_uri || props.compagnie?.logo_url || null);
const nomCompagnie = computed(() => props.compagnie?.nom?.trim() || props.agence?.nom || '');
const trajet = computed(() => {
    const depart = props.agence?.ville_nom?.trim();
    return depart ? `${depart} → ${props.lot.destination}` : props.lot.destination;
});

const statutLibelle: Record<StatutLot, string> = {
    en_preparation: 'En préparation',
    expedie: 'Expédié',
    arrive: 'Arrivé',
    livre: 'Livré',
};

function formatDate(date: string): string {
    const [annee, mois, jour] = date.slice(0, 10).split('-');
    return annee && mois && jour ? `${jour}/${mois}/${annee}` : date;
}

function masquerLogo(event: Event): void {
    (event.currentTarget as HTMLImageElement).style.display = 'none';
}
</script>

<template>
    <article class="ticket-recu etiquette-lot">
        <header class="entete-etiquette">
            <img v-if="logoSrc" :src="logoSrc" alt="" class="logo-etiquette" @error="masquerLogo">
            <p v-if="nomCompagnie" class="compagnie">{{ nomCompagnie }}</p>
            <p class="type-lot">ÉTIQUETTE · {{ titreType }}</p>
        </header>

        <div class="numero-etiquette">
            <span>LOT N° {{ lot.numero_lot }}</span>
            <strong>{{ lot.reference }}</strong>
        </div>

        <section class="bloc-etiquette destination-bloc">
            <p class="libelle">DESTINATION</p>
            <p class="destination-etiquette">{{ trajet }}</p>
            <p v-if="lot.voyage_libelle" class="voyage-etiquette">Voyage : {{ lot.voyage_libelle }}</p>
            <p v-else-if="lot.type !== 'courrier_international'" class="voyage-etiquette">Sans voyage</p>
        </section>

        <section class="bloc-etiquette">
            <div class="ligne"><span>Date</span><strong>{{ formatDate(lot.date_operation) }}</strong></div>
            <div class="ligne"><span>Contenu</span><strong>{{ lot.nombre_elements }} {{ lot.type === 'bagage' ? 'bagage(s)' : 'courrier(s)' }}</strong></div>
            <div class="ligne"><span>Statut</span><strong>{{ statutLibelle[lot.statut] }}</strong></div>
            <div class="ligne"><span>Agence</span><strong>{{ agence?.nom || '—' }}</strong></div>
        </section>

        <footer class="bas-etiquette">
            <span>Créé par</span>
            <strong>{{ lot.cree_par || '—' }}</strong>
        </footer>
    </article>
</template>

<style scoped>
.etiquette-lot {
    box-sizing: border-box;
    width: var(--impression-largeur-contenu, 76mm);
    margin: 0 auto;
    padding: 0.8mm;
    color: #000;
    font-family: Arial, 'Helvetica Neue', sans-serif;
    font-size: 13px;
    line-height: 1.25;
}

.etiquette-lot,
.etiquette-lot * {
    box-sizing: border-box;
    min-width: 0;
    max-width: 100%;
    overflow-wrap: break-word;
    white-space: normal;
    word-break: normal;
}

.entete-etiquette {
    text-align: center;
}

.logo-etiquette {
    display: block;
    width: auto;
    height: 24px;
    max-width: 42mm;
    margin: 0 auto 1mm;
    object-fit: contain;
}

.compagnie {
    font-size: 15px;
    font-weight: 800;
    line-height: 1.1;
    text-transform: uppercase;
}

.type-lot {
    margin-top: 0.5mm;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
}

.numero-etiquette {
    display: flex;
    flex-direction: column;
    gap: 0.8mm;
    margin: 2mm 0;
    padding: 2mm 1.5mm;
    border: 1.5px solid #000;
    text-align: center;
}

.ticket-recu.etiquette-lot .numero-etiquette {
    align-items: stretch !important;
}

.numero-etiquette span {
    font-size: 17px;
    font-weight: 800;
}

.numero-etiquette strong {
    flex: 0 1 auto !important;
    font-size: 20px;
    line-height: 1.1;
    text-align: center !important;
}

.bloc-etiquette {
    margin-top: 1.5mm;
    padding: 1.5mm;
    border: 1px solid #000;
}

.libelle {
    font-size: 11px;
    font-weight: 800;
}

.destination-etiquette {
    margin: 0.8mm 0;
    font-size: 18px;
    font-weight: 800;
    line-height: 1.12;
    text-align: center;
    text-transform: uppercase;
}

.voyage-etiquette {
    padding-top: 1mm;
    border-top: 1px dashed #000;
    font-size: 11px;
    font-weight: 600;
    text-align: center;
}

.ligne,
.bas-etiquette {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.5mm 1mm;
    padding: 0.6mm 0;
}

.ligne span,
.bas-etiquette span {
    flex: 0 0 auto;
}

.ligne strong,
.bas-etiquette strong {
    flex: 1 1 30mm;
    text-align: right;
}

.bas-etiquette {
    margin-top: 1.5mm;
    padding: 1.2mm 0.5mm 0;
    border-top: 1px dashed #000;
    font-size: 11px;
}
</style>
