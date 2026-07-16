<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { Activity, ArrowRight, BadgeCheck, BriefcaseBusiness, CalendarDays, Package, Send, Ticket } from '@lucide/vue';
import AppSidebarLayout from '@/Layouts/app/AppSidebarLayout.vue';
import { useConfigStore } from '@/Stores/config';
import { useSessionStore } from '@/Stores/session';

interface TicketDuJour { montant: number; timbre: number }
interface BagageDuJour { montant: number }
interface CourrierDuJour { montant_total: number }

const session = useSessionStore();
const config = useConfigStore();
const resume = ref({ tickets: 0, totalTickets: 0, bagages: 0, totalBagages: 0, courriers: 0, totalCourriers: 0 });

const formatMontant = (m: number) => new Intl.NumberFormat('fr-FR').format(m) + ' FCFA';
const totalOperations = computed(() => resume.value.tickets + resume.value.bagages + resume.value.courriers);
const totalEncaisse = computed(() => resume.value.totalTickets + resume.value.totalBagages + resume.value.totalCourriers);
const roles: Record<string, string> = {
    super_admin: 'Super admin',
    admin: 'Admin',
    chef_gare: 'Chef de gare',
    agent: 'Agent',
};
const modulesActifs = computed(() => [
    session.peutModule('ticket') ? 'Ticket' : null,
    session.peutModule('bagage') ? 'Bagage' : null,
    session.peutModule('courrier') ? 'Courrier' : null,
].filter(Boolean).join(' · '));
const roleLabel = computed(() => roles[session.role] ?? session.role);
const dateDuJour = new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
}).format(new Date());

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
            <section class="overflow-hidden rounded-lg border bg-card shadow-sm">
                <div class="border-l-4 border-emerald-500 px-5 py-4">
                    <div class="flex flex-wrap items-start justify-between gap-4">
                        <div class="min-w-0">
                            <p class="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-300">
                                <BadgeCheck class="size-4" />
                                Poste prêt
                            </p>
                            <h1 class="mt-1 text-2xl font-semibold">Bonjour {{ session.nom }}</h1>
                            <p class="mt-1 text-[0.95rem] text-muted-foreground">
                                {{ config.agence ? `${config.agence.nom} - ${config.agence.ville_nom}` : 'Agence locale' }}
                                <span class="mx-1">·</span>
                                {{ roleLabel }}
                            </p>
                        </div>
                        <div class="rounded-lg border bg-muted/30 px-4 py-3 text-right">
                            <p class="flex items-center justify-end gap-2 text-xs font-medium uppercase text-muted-foreground">
                                <CalendarDays class="size-4" />
                                Aujourd'hui
                            </p>
                            <p class="mt-1 text-sm font-semibold capitalize">{{ dateDuJour }}</p>
                        </div>
                    </div>
                </div>
            </section>

            <section class="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div class="rounded-lg border border-emerald-200/70 bg-card p-4 shadow-sm dark:border-emerald-900/60">
                    <div class="flex items-center justify-between gap-3">
                        <p class="text-sm font-medium text-muted-foreground">Encaissement du jour</p>
                        <span class="rounded-md bg-emerald-500/10 p-2 text-emerald-600 dark:text-emerald-300">
                            <BriefcaseBusiness class="size-5" />
                        </span>
                    </div>
                    <p class="mt-3 text-2xl font-semibold">{{ formatMontant(totalEncaisse) }}</p>
                    <p class="mt-1 text-sm text-muted-foreground">{{ totalOperations }} opération(s)</p>
                </div>

                <div class="rounded-lg border border-sky-200/70 bg-card p-4 shadow-sm dark:border-sky-900/60">
                    <div class="flex items-center justify-between gap-3">
                        <p class="text-sm font-medium text-muted-foreground">Modules actifs</p>
                        <span class="rounded-md bg-sky-500/10 p-2 text-sky-600 dark:text-sky-300">
                            <Activity class="size-5" />
                        </span>
                    </div>
                    <p class="mt-3 text-lg font-semibold">{{ modulesActifs || 'Aucun module' }}</p>
                    <p class="mt-1 text-sm text-muted-foreground">Accès autorisés sur ce poste</p>
                </div>

                <div class="rounded-lg border border-amber-200/80 bg-card p-4 shadow-sm dark:border-amber-900/60">
                    <div class="flex items-center justify-between gap-3">
                        <p class="text-sm font-medium text-muted-foreground">Licence</p>
                        <span class="rounded-md bg-amber-500/10 p-2 text-amber-600 dark:text-amber-300">
                            <BadgeCheck class="size-5" />
                        </span>
                    </div>
                    <p class="mt-3 text-lg font-semibold">{{ config.licenceValide ? 'Active' : 'À vérifier' }}</p>
                    <p class="mt-1 text-sm text-muted-foreground">
                        <span v-if="config.licence?.date_expiration">Fin le {{ config.licence.date_expiration }}</span>
                        <span v-else>Non définie localement</span>
                    </p>
                </div>
            </section>

            <div class="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h2 class="text-lg font-semibold">Accès rapides</h2>
                    <p class="text-sm text-muted-foreground">Choisissez une opération pour démarrer rapidement.</p>
                </div>
                <p class="rounded-md border bg-background px-3 py-1.5 text-sm text-muted-foreground">
                    Données du jour
                </p>
            </div>

            <div class="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
                <RouterLink
                    v-if="session.peutModule('ticket')"
                    :to="{ name: 'vente' }"
                    class="group rounded-lg border border-sky-200/70 bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-md dark:border-sky-900/60"
                >
                    <div class="flex items-start justify-between gap-3">
                        <span class="rounded-lg bg-sky-500/10 p-3 text-sky-600 dark:text-sky-300">
                            <Ticket class="size-6" />
                        </span>
                        <ArrowRight class="size-5 text-muted-foreground transition group-hover:translate-x-1 group-hover:text-sky-600" />
                    </div>
                    <p class="mt-4 text-[0.95rem] text-muted-foreground">Ventes du jour</p>
                    <p class="mt-1 text-3xl font-semibold">{{ resume.tickets }}</p>
                    <p class="mt-1 text-[0.95rem] font-medium text-sky-700 dark:text-sky-300">{{ formatMontant(resume.totalTickets) }}</p>
                </RouterLink>
                <RouterLink
                    v-if="session.peutModule('bagage')"
                    :to="{ name: 'bagages' }"
                    class="group rounded-lg border border-amber-200/80 bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-amber-300 hover:shadow-md dark:border-amber-900/60"
                >
                    <div class="flex items-start justify-between gap-3">
                        <span class="rounded-lg bg-amber-500/10 p-3 text-amber-600 dark:text-amber-300">
                            <Package class="size-6" />
                        </span>
                        <ArrowRight class="size-5 text-muted-foreground transition group-hover:translate-x-1 group-hover:text-amber-600" />
                    </div>
                    <p class="mt-4 text-[0.95rem] text-muted-foreground">Bagages du jour</p>
                    <p class="mt-1 text-3xl font-semibold">{{ resume.bagages }}</p>
                    <p class="mt-1 text-[0.95rem] font-medium text-amber-700 dark:text-amber-300">{{ formatMontant(resume.totalBagages) }}</p>
                </RouterLink>
                <RouterLink
                    v-if="session.peutModule('courrier')"
                    :to="{ name: 'courrier' }"
                    class="group rounded-lg border border-violet-200/70 bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-md dark:border-violet-900/60"
                >
                    <div class="flex items-start justify-between gap-3">
                        <span class="rounded-lg bg-violet-500/10 p-3 text-violet-600 dark:text-violet-300">
                            <Send class="size-6" />
                        </span>
                        <ArrowRight class="size-5 text-muted-foreground transition group-hover:translate-x-1 group-hover:text-violet-600" />
                    </div>
                    <p class="mt-4 text-[0.95rem] text-muted-foreground">Courriers du jour</p>
                    <p class="mt-1 text-3xl font-semibold">{{ resume.courriers }}</p>
                    <p class="mt-1 text-[0.95rem] font-medium text-violet-700 dark:text-violet-300">{{ formatMontant(resume.totalCourriers) }}</p>
                </RouterLink>
            </div>
        </div>
    </AppSidebarLayout>
</template>
