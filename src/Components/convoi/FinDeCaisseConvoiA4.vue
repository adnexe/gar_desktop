<script setup lang="ts">
import { computed } from 'vue';
import type { AgenceLocale, CompagnieLocale } from '@/Stores/config';
import type { Convoi } from '@/types/convoi';

const props = defineProps<{ convoi: Convoi; agence: AgenceLocale | null; compagnie: CompagnieLocale | null }>();
const logo = computed(() => props.compagnie?.logo_data_uri || props.compagnie?.logo_url || null);
const formatMontant = (montant: number) => `${new Intl.NumberFormat('fr-FR').format(montant)} FCFA`;
const formatDate = (date: string) => date.split('-').reverse().join('/');
function masquerLogo(event: Event) { (event.currentTarget as HTMLImageElement).style.display = 'none'; }
</script>

<template>
    <div class="zone-impression-a4" aria-hidden="true">
        <article class="bordereau-a4 fin-caisse-convoi">
            <header class="bordereau-entete">
                <div class="bordereau-identite">
                    <img v-if="logo" :src="logo" alt="" class="bordereau-logo" @error="masquerLogo">
                    <div><p v-if="compagnie?.nom" class="bordereau-compagnie">{{ compagnie.nom }}</p><h1>Fin de caisse du convoi</h1><p v-if="agence?.telephone">Tél. {{ agence.telephone }}</p></div>
                </div>
                <div class="bordereau-reference"><span>CONVOI</span><strong>{{ convoi.reference }}</strong></div>
            </header>
            <section class="caisse-details">
                <div><span>Agence de départ</span><strong>{{ agence?.nom || convoi.agence }}</strong><small>{{ convoi.ville_depart }}</small></div>
                <div><span>Destination</span><strong>{{ convoi.destination }}</strong><small>{{ convoi.precision_destination }}</small></div>
                <div><span>Départ</span><strong>{{ formatDate(convoi.date_depart) }} à {{ convoi.heure_depart }}</strong></div>
                <div><span>Retour prévu</span><strong>{{ formatDate(convoi.date_retour) }}<template v-if="convoi.heure_retour"> à {{ convoi.heure_retour }}</template></strong></div>
                <div><span>Nombre de places</span><strong>{{ convoi.nombre_places }}</strong></div>
                <div><span>Agent ayant créé le convoi</span><strong>{{ convoi.cree_par || '—' }}</strong></div>
            </section>
            <section class="caisse-total"><span>Montant fixé</span><strong>{{ formatMontant(convoi.montant_fixe) }}</strong></section>
            <section class="caisse-signatures"><div>Signature de l’agent</div><div>Visa du responsable</div></section>
        </article>
    </div>
</template>

<style scoped>
.caisse-details { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); margin-top: 10mm; border: 1px solid #aaa; }
.caisse-details > div { min-height: 20mm; padding: 4mm; border-right: 1px solid #aaa; border-bottom: 1px solid #aaa; overflow-wrap: anywhere; }
.caisse-details > div:nth-child(even) { border-right: 0; }
.caisse-details > div:nth-last-child(-n + 2) { border-bottom: 0; }
.caisse-details span, .caisse-total span { display: block; color: #555; font-size: 8pt; text-transform: uppercase; }
.caisse-details strong { display: block; margin-top: 1.5mm; font-size: 12pt; }
.caisse-details small { display: block; margin-top: 1mm; color: #555; }
.caisse-total { margin-top: 10mm; padding: 7mm; border: 2px solid #222; text-align: center; }
.caisse-total strong { display: block; margin-top: 2mm; font-size: 24pt; }
.caisse-signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 18mm; margin-top: 24mm; text-align: center; }
.caisse-signatures div { padding-top: 18mm; border-top: 1px solid #222; }
</style>
