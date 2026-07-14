<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { Package, Send, Ticket } from '@lucide/vue';
import AppSidebarLayout from '@/Layouts/app/AppSidebarLayout.vue';
import { useSessionStore } from '@/Stores/session';

interface TicketDuJour { montant: number; timbre: number }
interface BagageDuJour { montant: number }
interface CourrierDuJour { montant_total: number }

const session = useSessionStore();
const resume = ref({ tickets: 0, totalTickets: 0, bagages: 0, totalBagages: 0, courriers: 0, totalCourriers: 0 });

const formatMontant = (m: number) => new Intl.NumberFormat('fr-FR').format(m) + ' FCFA';

onMounted(async () => {
    if (!session.agenceId) return;
    const data = (await window.api.historique.duJour(session.agenceId)) as {
        tickets: TicketDuJour[];
        bagages: BagageDuJour[];
        courriers: CourrierDuJour[];
    };

    resume.value = {
        tickets: data.tickets.length,
        totalTickets: data.tickets.reduce((s, t) => s + t.montant + t.timbre, 0),
        bagages: data.bagages.length,
        totalBagages: data.bagages.reduce((s, b) => s + b.montant, 0),
        courriers: data.courriers.length,
        totalCourriers: data.courriers.reduce((s, c) => s + c.montant_total, 0),
    };
});
</script>

<template>
    <AppSidebarLayout titre="Tableau de bord">
        <div class="space-y-5">
            <div class="rounded-lg border bg-card px-5 py-4 shadow-sm">
                <h1 class="text-xl font-semibold">Bonjour {{ session.nom }}</h1>
                <p class="mt-1 text-[0.95rem] text-muted-foreground">Vue rapide des opérations autorisées pour votre poste.</p>
            </div>

            <div class="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
                <RouterLink v-if="session.peutModule('ticket')" :to="{ name: 'vente' }" class="rounded-lg border bg-card p-6 shadow-sm transition-colors hover:bg-muted/40">
                    <Ticket class="mb-3 size-7 text-muted-foreground" />
                    <p class="text-[0.95rem] text-muted-foreground">Ventes du jour</p>
                    <p class="mt-1 text-3xl font-semibold">{{ resume.tickets }}</p>
                    <p class="mt-1 text-[0.95rem] text-muted-foreground">{{ formatMontant(resume.totalTickets) }}</p>
                </RouterLink>
                <RouterLink v-if="session.peutModule('bagage')" :to="{ name: 'bagages' }" class="rounded-lg border bg-card p-6 shadow-sm transition-colors hover:bg-muted/40">
                    <Package class="mb-3 size-7 text-muted-foreground" />
                    <p class="text-[0.95rem] text-muted-foreground">Bagages du jour</p>
                    <p class="mt-1 text-3xl font-semibold">{{ resume.bagages }}</p>
                    <p class="mt-1 text-[0.95rem] text-muted-foreground">{{ formatMontant(resume.totalBagages) }}</p>
                </RouterLink>
                <RouterLink v-if="session.peutModule('courrier')" :to="{ name: 'courrier' }" class="rounded-lg border bg-card p-6 shadow-sm transition-colors hover:bg-muted/40">
                    <Send class="mb-3 size-7 text-muted-foreground" />
                    <p class="text-[0.95rem] text-muted-foreground">Courriers du jour</p>
                    <p class="mt-1 text-3xl font-semibold">{{ resume.courriers }}</p>
                    <p class="mt-1 text-[0.95rem] text-muted-foreground">{{ formatMontant(resume.totalCourriers) }}</p>
                </RouterLink>
            </div>
        </div>
    </AppSidebarLayout>
</template>
