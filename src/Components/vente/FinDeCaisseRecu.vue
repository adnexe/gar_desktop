<script setup lang="ts">
export interface RapportFinDeCaisse {
    date: string;
    voyages: { trajet_id: number; trajet: string; date_depart: string; heure_depart: string; numero_depart: number; nombre_tickets: number; montant_total: number }[];
    nombre_tickets_total: number;
    montant_total: number;
}

defineProps<{
    rapport: RapportFinDeCaisse | null;
    agence: string;
    caissier: string;
    /** Libellé du voyage quand la fin de caisse ne concerne qu'un seul départ. */
    voyage?: string;
}>();

const formatMontant = (m: number) => new Intl.NumberFormat('fr-FR').format(m) + ' FCFA';
</script>

<template>
    <div v-if="rapport" class="ticket-recu" style="width: 72mm">
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
        <p v-if="voyage" style="font-weight: 700">{{ voyage }}</p>

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
