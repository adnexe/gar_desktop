<script setup lang="ts">
export interface RapportFinDeCaisse {
    date: string;
    voyages: { trajet_id: number; trajet: string; date_depart: string; heure_depart: string; numero_depart: number; nombre_tickets: number; montant_total: number }[];
    nombre_tickets_total: number;
    montant_total: number;
    agents: string[];
}

defineProps<{
    rapport: RapportFinDeCaisse | null;
    agence: string;
    caissier: string;
    /** Libellé du voyage quand la fin de caisse ne concerne qu'un seul départ. */
    voyage?: string;
    placesVendues?: number;
    placesRestantes?: number;
}>();

const formatMontant = (m: number) => new Intl.NumberFormat('fr-FR').format(m) + ' FCFA';
</script>

<template>
    <div v-if="rapport" class="ticket-recu" style="width: 70mm; margin: 0 auto">
        <p class="text-center font-bold">{{ agence }}</p>
        <p class="text-center font-bold">{{ voyage ? 'FIN DE CAISSE — VOYAGE' : 'FIN DE CAISSE' }}</p>
        <p style="border-top: 1px dashed #000; margin: 4px 0" />

        <div class="ligne" style="display:flex;justify-content:space-between">
            <span>Date</span>
            <span>{{ rapport.date }}</span>
        </div>
        <div class="ligne" style="display:flex;justify-content:space-between">
            <span>Caissier</span>
            <span>{{ caissier }}</span>
        </div>
        <div v-if="rapport.agents.length" class="ligne" style="display:flex;justify-content:space-between;gap:8px">
            <span>Agent(s)</span>
            <span style="text-align:right">{{ rapport.agents.join(', ') }}</span>
        </div>
        <p v-if="voyage" style="font-weight: 700">{{ voyage }}</p>
        <div v-if="voyage && placesVendues !== undefined" class="ligne" style="display:flex;justify-content:space-between">
            <span>Places vendues</span>
            <span>{{ placesVendues }}</span>
        </div>
        <div v-if="voyage && placesRestantes !== undefined" class="ligne" style="display:flex;justify-content:space-between">
            <span>Places restantes</span>
            <span>{{ placesRestantes }}</span>
        </div>

        <p style="border-top: 1px dashed #000; margin: 4px 0" />

        <div v-for="v in rapport.voyages" :key="v.trajet_id" style="margin-bottom: 4px">
            <p style="font-weight: 700">{{ v.trajet }} — {{ v.heure_depart }}</p>
            <div class="ligne" style="display:flex;justify-content:space-between">
                <span>{{ v.nombre_tickets }} ticket(s)</span>
                <span>{{ formatMontant(v.montant_total) }}</span>
            </div>
        </div>

        <p v-if="rapport.voyages.length === 0" class="text-center">Aucune vente ce jour.</p>

        <p style="border-top: 1px dashed #000; margin: 4px 0" />

        <div class="ligne" style="display:flex;justify-content:space-between;font-weight:700">
            <span>Total tickets</span>
            <span>{{ rapport.nombre_tickets_total }}</span>
        </div>
        <div class="ligne" style="display:flex;justify-content:space-between;font-weight:700;font-size:13px">
            <span>Montant global</span>
            <span>{{ formatMontant(rapport.montant_total) }}</span>
        </div>
    </div>
</template>
