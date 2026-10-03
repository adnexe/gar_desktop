<script setup lang="ts">
import { computed } from 'vue';
import type { AgenceLocale, CompagnieLocale } from '@/Stores/config';
import type { Convoi } from '@/types/convoi';

const props = defineProps<{
    convoi: Convoi;
    agence: AgenceLocale | null;
    compagnie: CompagnieLocale | null;
    mode: 'bordereau' | 'caisse';
}>();
const logo = computed(() => props.compagnie?.logo_data_uri || props.compagnie?.logo_url || null);
const telephone = computed(() => props.agence?.telephone || props.compagnie?.telephone || null);
const formatDate = (date: string) => date ? date.split('T')[0]!.split('-').reverse().join('/') : 'Non précisé';
const formatMontant = (montant: number) => `${new Intl.NumberFormat('fr-FR').format(montant)} FCFA`;
const statut = computed(() => ({ programme: 'Programmé', parti: 'Parti', termine: 'Terminé', annule: 'Annulé' })[props.convoi.statut]);
function masquerLogo(event: Event) { (event.currentTarget as HTMLImageElement).style.display = 'none'; }
</script>

<template>
    <article class="ticket-recu convoi-recu">
        <header class="convoi-entete">
            <img v-if="logo" :src="logo" alt="" class="convoi-logo" @error="masquerLogo">
            <p v-if="compagnie?.nom" class="compagnie">{{ compagnie.nom }}</p>
            <p class="nom-agence">{{ agence?.nom || convoi.agence }}</p>
            <p v-if="telephone">Tél. {{ telephone }}</p>
            <h1>{{ mode === 'caisse' ? 'FIN DE CAISSE DU CONVOI' : 'BORDEREAU DE CONVOI' }}</h1>
            <p class="convoi-reference">{{ convoi.reference }}</p>
        </header>
        <section class="convoi-infos">
            <div class="ligne"><span>Départ</span><strong>{{ convoi.ville_depart }}</strong></div>
            <div class="ligne"><span>Destination</span><strong>{{ convoi.destination }}</strong></div>
            <p v-if="convoi.precision_destination" class="convoi-lieu">{{ convoi.precision_destination }}</p>
            <div class="ligne"><span>Date de départ</span><span>{{ formatDate(convoi.date_depart) }} à {{ convoi.heure_depart }}</span></div>
            <div class="ligne"><span>Retour prévu</span><span>{{ formatDate(convoi.date_retour) }}<template v-if="convoi.heure_retour"> à {{ convoi.heure_retour }}</template></span></div>
            <div class="ligne"><span>Places prévues</span><strong>{{ convoi.nombre_places }}</strong></div>
            <div class="ligne"><span>Agent</span><strong>{{ convoi.cree_par || 'Non renseigné' }}</strong></div>
            <div class="ligne"><span>État</span><span>{{ statut }}</span></div>
        </section>
        <template v-if="mode === 'caisse'">
            <div class="ligne convoi-total"><strong>Montant fixé</strong><strong>{{ formatMontant(convoi.montant_fixe) }}</strong></div>
            <div class="convoi-signature">Signature de l’agent</div>
            <div class="convoi-signature">Visa du responsable</div>
        </template>
        <template v-else>
            <table class="convoi-passagers">
                <thead><tr><th>N°</th><th>Passager / téléphone / signature</th></tr></thead>
                <tbody><tr v-for="place in convoi.nombre_places" :key="place"><td>{{ place }}</td><td><div class="ligne-manuscrite"></div><div class="ligne-manuscrite"></div></td></tr></tbody>
            </table>
            <p class="convoi-pied">{{ convoi.nombre_places }} place(s) prévues</p>
        </template>
    </article>
</template>

<style scoped>
.convoi-recu { width: var(--impression-largeur-contenu, 70mm); margin: 0; font: 12px/1.35 Arial, Helvetica, sans-serif; color: #000; background: #fff; letter-spacing: 0; }
.convoi-recu * { min-width: 0; max-width: 100%; overflow-wrap: anywhere; word-break: normal; white-space: normal; }
.convoi-entete { text-align: center; margin-bottom: 2mm; }
.convoi-logo { display: block; width: 18mm; height: 12mm; object-fit: contain; margin: 0 auto 1mm; }
.convoi-entete p { margin: 0 0 1mm; }
.compagnie, .nom-agence { font-weight: 700; }
.convoi-entete h1 { font-size: 14px; font-weight: 700; margin: 2mm 0 1mm; }
.convoi-reference { font-weight: 700; }
.convoi-infos { border-top: 1px dashed #000; padding-top: 1mm; }
.ligne { display: grid; grid-template-columns: minmax(0, .42fr) minmax(0, .58fr); gap: 2mm; margin: 0 0 1mm; break-inside: avoid; }
.ligne > :last-child { text-align: right; }
.convoi-lieu { margin: 0 0 2mm; }
.convoi-total { border-top: 1px dashed #000; padding-top: 2mm; margin-top: 2mm; font-size: 13px; }
.convoi-signature { padding-top: 8mm; border-bottom: 1px dotted #555; margin-top: 2mm; font-size: 11px; break-inside: avoid; }
.convoi-passagers { width: 100%; border-collapse: collapse; table-layout: fixed; margin-top: 2mm; }
.convoi-passagers th, .convoi-passagers td { border: 1px solid #555; padding: 1mm; text-align: left; }
.convoi-passagers th:first-child, .convoi-passagers td:first-child { width: 7mm; text-align: center; }
.convoi-passagers th { font-size: 11px; }
.convoi-passagers td { vertical-align: top; }
.ligne-manuscrite { height: 4mm; border-bottom: 1px dotted #aaa; }
.convoi-passagers thead { display: table-header-group; }
.convoi-passagers tr { break-inside: avoid; page-break-inside: avoid; }
.convoi-pied { font-weight: 700; margin-top: 2mm; }
@media print { .ticket-recu.convoi-recu { break-inside: auto; page-break-inside: auto; } }
</style>
