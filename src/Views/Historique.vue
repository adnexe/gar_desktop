<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { History } from '@lucide/vue';
import AppSidebarLayout from '@/Layouts/app/AppSidebarLayout.vue';
import { useSessionStore } from '@/Stores/session';

interface TicketDuJour { uuid: string; heure: string; trajet: string; numero_place: number; client: string | null; total: number }
interface BagageDuJour { uuid: string; heure: string; numero_ticket: string | null; description: string | null; montant: number }
interface CourrierDuJour { uuid: string; heure: string; destination: string; destinataire: string; montant_total: number }

const session = useSessionStore();
const tickets = ref<TicketDuJour[]>([]);
const bagages = ref<BagageDuJour[]>([]);
const courriers = ref<CourrierDuJour[]>([]);

const formatMontant = (m: number) => new Intl.NumberFormat('fr-FR').format(m) + ' FCFA';

// Les agents ne voient que leurs propres opérations ; admin et chef de gare
// voient tout (même règle que les écrans vente/bagages/courrier).
const userIdFiltre = computed(() => ['super_admin', 'admin', 'chef_gare'].includes(session.role) ? null : session.userId);

onMounted(async () => {
    if (!session.agenceId) return;
    const [ticketsDuJour, bagagesDuJour, courriersDuJour] = await Promise.all([
        session.peutModule('ticket')
            ? window.api.vente.ventesDuJour(session.agenceId, undefined, userIdFiltre.value) as Promise<TicketDuJour[]>
            : Promise.resolve([]),
        session.peutModule('bagage')
            ? window.api.bagage.duJour(session.agenceId, undefined, userIdFiltre.value) as Promise<BagageDuJour[]>
            : Promise.resolve([]),
        session.peutModule('courrier')
            ? window.api.courrier.duJour(session.agenceId, undefined, userIdFiltre.value) as Promise<CourrierDuJour[]>
            : Promise.resolve([]),
    ]);

    tickets.value = ticketsDuJour;
    bagages.value = bagagesDuJour;
    courriers.value = courriersDuJour;
});
</script>

<template>
    <AppSidebarLayout titre="Historique">
        <div class="space-y-5">
            <div class="rounded-lg border bg-card px-5 py-4 shadow-sm">
                <h1 class="flex items-center gap-2 text-xl font-semibold"><History class="size-5" /> Historique du jour</h1>
                <p class="mt-1 text-[0.95rem] text-muted-foreground">Les opérations affichées respectent les modules autorisés pour votre compte.</p>
            </div>

            <section v-if="session.peutModule('ticket')" class="overflow-hidden rounded-lg border bg-card p-5 shadow-sm">
                <h2 class="mb-3 text-base font-semibold">Tickets</h2>
                <table class="w-full text-[0.95rem]">
                    <tbody>
                        <tr v-for="t in tickets" :key="t.uuid" class="border-b last:border-0 hover:bg-muted/30">
                            <td class="px-3 py-3">{{ t.heure }}</td>
                            <td class="px-3 py-3">{{ t.trajet }}</td>
                            <td class="px-3 py-3">N° {{ t.numero_place }}</td>
                            <td class="px-3 py-3">{{ t.client ?? '—' }}</td>
                            <td class="px-3 py-3 text-right font-semibold">{{ formatMontant(t.total) }}</td>
                        </tr>
                    </tbody>
                </table>
                <p v-if="tickets.length === 0" class="rounded-md bg-muted/40 px-4 py-6 text-center text-[0.95rem] text-muted-foreground">Aucun ticket aujourd'hui.</p>
            </section>

            <section v-if="session.peutModule('bagage')" class="overflow-hidden rounded-lg border bg-card p-5 shadow-sm">
                <h2 class="mb-3 text-base font-semibold">Bagages</h2>
                <table class="w-full text-[0.95rem]">
                    <tbody>
                        <tr v-for="b in bagages" :key="b.uuid" class="border-b last:border-0 hover:bg-muted/30">
                            <td class="px-3 py-3">{{ b.heure }}</td>
                            <td class="px-3 py-3">{{ b.numero_ticket ? `Ticket ${b.numero_ticket}` : 'Sans ticket' }}</td>
                            <td class="px-3 py-3">{{ b.description ?? '—' }}</td>
                            <td class="px-3 py-3 text-right font-semibold">{{ formatMontant(b.montant) }}</td>
                        </tr>
                    </tbody>
                </table>
                <p v-if="bagages.length === 0" class="rounded-md bg-muted/40 px-4 py-6 text-center text-[0.95rem] text-muted-foreground">Aucun bagage aujourd'hui.</p>
            </section>

            <section v-if="session.peutModule('courrier')" class="overflow-hidden rounded-lg border bg-card p-5 shadow-sm">
                <h2 class="mb-3 text-base font-semibold">Courriers</h2>
                <table class="w-full text-[0.95rem]">
                    <tbody>
                        <tr v-for="c in courriers" :key="c.uuid" class="border-b last:border-0 hover:bg-muted/30">
                            <td class="px-3 py-3">{{ c.heure }}</td>
                            <td class="px-3 py-3">{{ c.destination }}</td>
                            <td class="px-3 py-3">{{ c.destinataire }}</td>
                            <td class="px-3 py-3 text-right font-semibold">{{ formatMontant(c.montant_total) }}</td>
                        </tr>
                    </tbody>
                </table>
                <p v-if="courriers.length === 0" class="rounded-md bg-muted/40 px-4 py-6 text-center text-[0.95rem] text-muted-foreground">Aucun courrier aujourd'hui.</p>
            </section>
        </div>
    </AppSidebarLayout>
</template>
