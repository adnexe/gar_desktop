<script setup lang="ts">
defineProps<{
    titre: string;
    agence: string;
    caissier: string;
    date: string;
    libelleCompteur: string;
    nombre: number;
    montantTotal: number;
}>();

const formatMontant = (m: number) => new Intl.NumberFormat('fr-FR').format(m) + ' FCFA';
</script>

<template>
    <div class="ticket-recu">
        <p class="text-center font-bold">{{ agence }}</p>
        <p class="text-center font-bold">{{ titre }}</p>
        <hr />
        <div style="display:flex;justify-content:space-between"><span>Date</span><span>{{ date }}</span></div>
        <div style="display:flex;justify-content:space-between"><span>Caissier</span><span>{{ caissier }}</span></div>
        <hr />
        <div style="display:flex;justify-content:space-between"><span>{{ libelleCompteur }}</span><span>{{ nombre }}</span></div>
        <div style="display:flex;justify-content:space-between;font-weight:700"><span>Montant total</span><span>{{ formatMontant(montantTotal) }}</span></div>
    </div>
</template>
