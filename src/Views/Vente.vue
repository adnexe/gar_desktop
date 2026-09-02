<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { BriefcaseBusiness, ClipboardList, Plus, Printer, Receipt, Stamp, Ticket } from '@lucide/vue';
import AppSidebarLayout from '@/Layouts/app/AppSidebarLayout.vue';
import RecupererVentesButton from '@/Components/RecupererVentesButton.vue';
import VenteForm from '@/Components/vente/VenteForm.vue';
import FinDeCaisseRecu, { type RapportFinDeCaisse } from '@/Components/vente/FinDeCaisseRecu.vue';
import { Badge } from '@/Components/ui/badge';
import { Button } from '@/Components/ui/button';
import { Input } from '@/Components/ui/input';
import { Spinner } from '@/Components/ui/spinner';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/Components/ui/dialog';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/Components/ui/select';
import { useCompteurAnime } from '@/composables/useCompteurAnime';
import { choisirSalutation } from '@/composables/useSalutation';
import { useConfigStore } from '@/Stores/config';
import { useSessionStore } from '@/Stores/session';
import type { VenteDuJour } from '@/types/vente';
import { useDateCaisseFiltre } from '@/composables/useDateCaisseFiltre';
import { creerProtectionChargement, insererEnTeteSansDoublon } from '@/lib/listeTransactions';

interface Ville { id: number; uuid: string; nom: string }

const config = useConfigStore();
const session = useSessionStore();

const villes = ref<Ville[]>([]);
const dialogOuvert = ref(false);
const venteForm = ref<InstanceType<typeof VenteForm> | null>(null);

function ouvrirVente() {
    venteForm.value?.resetTout();
    dialogOuvert.value = true;
}

const { dateFiltre, aujourdhui, actualiserJourDeCaisse } = useDateCaisseFiltre();

const ventesDuJour = ref<VenteDuJour[]>([]);
const protectionChargementVentes = creerProtectionChargement();
const recherche = ref('');
const userIdFinDeCaisse = computed(() => ['super_admin', 'admin', 'chef_gare'].includes(session.role) ? null : session.userId);
// Filtre local : numéro de ticket, nom/prénoms ou téléphone du client.
const ventesAffichees = computed(() => {
    const t = recherche.value.trim().toLowerCase();
    if (!t) return ventesDuJour.value;
    return ventesDuJour.value.filter((v) =>
        (v.numero_ticket ?? '').toLowerCase().includes(t) ||
        (v.client ?? '').toLowerCase().includes(t) ||
        (v.client_telephone ?? '').toLowerCase().includes(t),
    );
});
const totalDuJour = computed(() => ventesDuJour.value.reduce((total, vente) => total + vente.total, 0));
const timbreDuJour = computed(() => ventesDuJour.value.reduce((total, vente) => total + vente.timbre, 0));
const sourceTickets = ref('serveur');
const recuperationLocaleDisponible = ref(false);
async function lireRecuperationLocale(voyageId?: number | null) {
    if (session.role !== 'super_admin' || !session.userId) return null;
    return window.api.config.ticketsRecuperes({ date: dateFiltre.value, userId: session.userId, voyageId });
}
async function apresRecuperation() {
    const local = await lireRecuperationLocale();
    sourceTickets.value = local?.modeClient && local.disponible ? 'local' : 'serveur';
    await chargerVentes();
}

async function chargerVentes() {
    const revision = protectionChargementVentes.commencer();
    if (!session.agenceId) {
        if (protectionChargementVentes.estCourant(revision)) ventesDuJour.value = [];
        return;
    }

    const local = await lireRecuperationLocale();
    if (!protectionChargementVentes.estCourant(revision)) return;
    recuperationLocaleDisponible.value = Boolean(local?.modeClient && local.disponible);
    if (sourceTickets.value === 'local' && recuperationLocaleDisponible.value) {
        ventesDuJour.value = local!.ventes as VenteDuJour[];
        return;
    }
    const ventes = (await window.api.vente.ventesDuJour(session.agenceId, dateFiltre.value, userIdFinDeCaisse.value)) as VenteDuJour[];
    if (protectionChargementVentes.estCourant(revision)) ventesDuJour.value = ventes;
}

function onVendu(vente: VenteDuJour) {
    sourceTickets.value = 'serveur';
    actualiserJourDeCaisse();
    if (dateFiltre.value === aujourdhui()) {
        protectionChargementVentes.invalider();
        ventesDuJour.value = insererEnTeteSansDoublon(ventesDuJour.value, vente);
    }
}

watch(dateFiltre, chargerVentes);
watch(sourceTickets, chargerVentes);

onMounted(async () => {
    villes.value = await window.api.referentiel.villes();
    await chargerVentes();
});

const finDeCaisseOuvert = ref(false);
const rapportFinDeCaisse = ref<RapportFinDeCaisse | null>(null);
const erreurImpression = ref('');
const impressionEnCours = ref(false);
const salutationFinDeCaisse = ref('');
const { valeur: totalAnime, animerVers: animerTotal } = useCompteurAnime();

// Fin de caisse ciblée : 0 = tous les voyages, sinon l'id du voyage choisi.
interface VoyageFinDeCaisse { voyage_id: number; itineraire: string; heure_depart: string; numero_depart: number; places_total: number; places_vendues: number }
const voyagesFinDeCaisse = ref<VoyageFinDeCaisse[]>([]);
const voyageFinDeCaisseId = ref(0);
const voyageFinDeCaisseChoisi = computed(() => voyagesFinDeCaisse.value.find((v) => v.voyage_id === voyageFinDeCaisseId.value) ?? null);
const voyageFinDeCaisseLibelle = computed(() => {
    const v = voyageFinDeCaisseChoisi.value;
    return v ? `${v.itineraire} — ${v.heure_depart} · Départ ${v.numero_depart}` : '';
});

async function chargerRapportFinDeCaisse() {
    if (!session.agenceId) return;
    if (sourceTickets.value === 'local' && recuperationLocaleDisponible.value) {
        const local = await lireRecuperationLocale(voyageFinDeCaisseId.value || null);
        rapportFinDeCaisse.value = local?.rapport as RapportFinDeCaisse;
        if (rapportFinDeCaisse.value) animerTotal(rapportFinDeCaisse.value.montant_total);
        return;
    }
    rapportFinDeCaisse.value = (await window.api.vente.finDeCaisse(
        session.agenceId,
        dateFiltre.value,
        userIdFinDeCaisse.value,
        voyageFinDeCaisseId.value || null,
    )) as RapportFinDeCaisse;
    animerTotal(rapportFinDeCaisse.value.montant_total);
}

async function ouvrirFinDeCaisse() {
    if (!session.agenceId) return;
    voyageFinDeCaisseId.value = 0;
    salutationFinDeCaisse.value = choisirSalutation();
    rapportFinDeCaisse.value = null;
    // Le dialog s'ouvre avant le chargement : l'animation du total ne se
    // voit que si elle tourne pendant que le dialog est déjà affiché.
    finDeCaisseOuvert.value = true;
    voyagesFinDeCaisse.value = sourceTickets.value === 'local' && recuperationLocaleDisponible.value
        ? ((await lireRecuperationLocale())?.voyages ?? []) as VoyageFinDeCaisse[]
        : (await window.api.vente.voyagesFinDeCaisse(session.agenceId, dateFiltre.value)) as VoyageFinDeCaisse[];
    await chargerRapportFinDeCaisse();
}

watch(voyageFinDeCaisseId, chargerRapportFinDeCaisse);

async function imprimerFinDeCaisse() {
    erreurImpression.value = '';
    impressionEnCours.value = true;
    await nextTick();
    try {
        const impression = await window.api.impression.imprimerRecu();
        if (!impression.ok) {
            erreurImpression.value = impression.erreur ?? "L'impression n'a pas pu être lancée.";
        }
    } finally {
        impressionEnCours.value = false;
    }
}

const formatMontant = (montant: number) => new Intl.NumberFormat('fr-FR').format(montant) + ' FCFA';
</script>

<template>
    <AppSidebarLayout titre="Vente de tickets">
        <div class="flex flex-col gap-5">
            <div class="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 class="text-xl font-semibold">Vente de tickets</h1>
                    <p class="text-[0.95rem] text-muted-foreground">Suivez les ventes du jour et enregistrez un nouveau ticket</p>
                </div>

                <!-- flex-wrap : sur les petits écrans (postes de bureau), les
                     boutons passent à la ligne au lieu de déborder du cadre. -->
                <div class="flex w-full flex-wrap items-center gap-2 lg:w-auto">
                    <Input v-model="dateFiltre" type="date" class="w-44" />
                    <RecupererVentesButton section="ticket" :date="dateFiltre" @recupere="apresRecuperation" />
                    <Button variant="outline" @click="ouvrirFinDeCaisse">
                        <ClipboardList />
                        Fin de caisse
                    </Button>
                    <Button :disabled="!session.agenceId" @click="ouvrirVente">
                        <Plus />
                        Vendre un ticket
                    </Button>
                </div>
            </div>

            <div v-if="recuperationLocaleDisponible" class="flex flex-wrap items-center gap-3">
                <Select v-model="sourceTickets">
                    <SelectTrigger class="w-full sm:w-72" aria-label="Ventes affichées"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="serveur">Ventes de la caisse serveur</SelectItem>
                        <SelectItem value="local">Ventes récupérées sur ce poste</SelectItem>
                    </SelectContent>
                </Select>
                <span v-if="sourceTickets === 'local'" class="text-sm text-amber-700 dark:text-amber-300">Copie locale : les ventes non encore sauvegardées dans admin peuvent manquer.</span>
            </div>

            <section class="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div class="rounded-lg border border-sky-200/70 bg-card p-4 shadow-sm dark:border-sky-900/60">
                    <div class="flex items-center justify-between gap-3">
                        <p class="text-sm font-medium text-muted-foreground">Tickets</p>
                        <span class="rounded-md bg-sky-500/10 p-2 text-sky-600 dark:text-sky-300">
                            <Ticket class="size-5" />
                        </span>
                    </div>
                    <p class="mt-3 text-2xl font-semibold">{{ ventesDuJour.length }}</p>
                    <p class="mt-1 text-sm text-muted-foreground">{{ dateFiltre === aujourdhui() ? "Aujourd'hui" : dateFiltre }}</p>
                </div>

                <div class="rounded-lg border border-emerald-200/70 bg-card p-4 shadow-sm dark:border-emerald-900/60">
                    <div class="flex items-center justify-between gap-3">
                        <p class="text-sm font-medium text-muted-foreground">Montant total</p>
                        <span class="rounded-md bg-emerald-500/10 p-2 text-emerald-600 dark:text-emerald-300">
                            <BriefcaseBusiness class="size-5" />
                        </span>
                    </div>
                    <p class="mt-3 text-2xl font-semibold">{{ formatMontant(totalDuJour) }}</p>
                    <p class="mt-1 text-sm text-muted-foreground">Prix + timbre encaissés</p>
                </div>

                <div class="rounded-lg border border-amber-200/80 bg-card p-4 shadow-sm dark:border-amber-900/60">
                    <div class="flex items-center justify-between gap-3">
                        <p class="text-sm font-medium text-muted-foreground">Timbre total</p>
                        <span class="rounded-md bg-amber-500/10 p-2 text-amber-600 dark:text-amber-300">
                            <Stamp class="size-5" />
                        </span>
                    </div>
                    <p class="mt-3 text-2xl font-semibold">{{ formatMontant(timbreDuJour) }}</p>
                    <p class="mt-1 text-sm text-muted-foreground">Timbre fiscal encaissé</p>
                </div>
            </section>

            <div class="overflow-hidden rounded-lg border bg-card p-5 shadow-sm">
                <div class="mb-3 flex items-center justify-between">
                    <p class="flex items-center gap-2 text-base font-medium">
                        <Receipt class="size-4" /> Ventes du {{ dateFiltre === aujourdhui() ? "jour" : dateFiltre }}
                    </p>
                </div>

                <Input v-model="recherche" placeholder="Rechercher : n° ticket, client, téléphone…" class="mb-3 h-10 max-w-md text-base" />

                <p v-if="ventesAffichees.length === 0" class="rounded-md bg-muted/40 px-4 py-6 text-center text-[0.95rem] text-muted-foreground">
                    {{ recherche ? 'Aucun résultat pour cette recherche.' : 'Aucune vente enregistrée pour cette date.' }}
                </p>

                <div v-else class="overflow-x-auto">
                <table class="w-full text-[0.95rem]">
                    <thead class="bg-muted/40">
                        <tr class="border-b text-left text-muted-foreground">
                            <th class="px-3 py-3 font-medium">Heure</th>
                            <th class="px-3 py-3 font-medium">N°</th>
                            <th class="px-3 py-3 font-medium">Trajet</th>
                            <th class="px-3 py-3 font-medium">Place</th>
                            <th class="px-3 py-3 font-medium">Client</th>
                            <th class="px-3 py-3 text-right font-medium">Prix</th>
                            <th class="px-3 py-3 text-right font-medium">Timbre</th>
                            <th class="px-3 py-3 text-right font-medium">Commission</th>
                            <th class="px-3 py-3 text-right font-medium">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="vente in ventesAffichees" :key="vente.uuid" class="border-b last:border-0 hover:bg-muted/30">
                            <td class="px-3 py-3">{{ vente.heure }}</td>
                            <td class="px-3 py-3 font-mono">{{ vente.numero_ticket }}</td>
                            <td class="px-3 py-3">{{ vente.trajet }}</td>
                            <td class="px-3 py-3">N° {{ vente.numero_place }}</td>
                            <td class="px-3 py-3">{{ vente.client ?? '—' }}</td>
                            <td class="px-3 py-3 text-right">{{ formatMontant(vente.montant) }}</td>
                            <td class="px-3 py-3 text-right">{{ formatMontant(vente.timbre) }}</td>
                            <td class="px-3 py-3 text-right">{{ vente.commission > 0 ? formatMontant(vente.commission) : '—' }}</td>
                            <td class="px-3 py-3 text-right font-semibold">
                                {{ formatMontant(vente.total) }}
                            </td>
                        </tr>
                    </tbody>
                </table>
                </div>
            </div>
        </div>

        <Dialog v-model:open="dialogOuvert">
            <!-- Hauteur fixe + overflow-hidden : pas de scroll global, chaque
                 colonne du formulaire gère son propre défilement interne. -->
            <DialogContent class="flex h-[90vh] w-[96vw] max-w-[96vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-[96vw] xl:max-w-7xl">
                <DialogHeader class="shrink-0 border-b bg-background px-6 py-4">
                    <DialogTitle class="flex items-center gap-2">
                        <Ticket class="size-5" /> Vente de tickets
                        <Badge v-if="config.agence" variant="outline" class="ml-auto mr-6">
                            {{ config.agence.nom }} — {{ config.agence.ville_nom }}
                        </Badge>
                    </DialogTitle>
                </DialogHeader>

                <VenteForm
                    ref="venteForm"
                    :agence-id="config.agence?.id ?? null"
                    :ville-depart-id="config.agence?.ville_id ?? null"
                    :villes="villes"
                    @vendu="onVendu"
                    @fermer="dialogOuvert = false"
                />
            </DialogContent>
        </Dialog>

        <!-- Rapport de fin de caisse : nombre de tickets et montant par trajet,
             pour faire le point avec le chef de gare avant de clôturer. -->
        <Dialog v-model:open="finDeCaisseOuvert">
            <DialogContent class="max-h-[92vh] w-[92vw] max-w-lg overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle class="flex items-center gap-2"><ClipboardList class="size-5" /> Fin de caisse — {{ dateFiltre }}</DialogTitle>
                </DialogHeader>

                <p class="text-sm text-muted-foreground">{{ salutationFinDeCaisse }}, {{ session.nom }} ! Voici le récap 🎟️</p>

                <Select v-model="voyageFinDeCaisseId">
                    <SelectTrigger class="w-full max-w-full [&>span]:truncate"><SelectValue placeholder="Tous les voyages" /></SelectTrigger>
                    <SelectContent class="max-w-[var(--reka-select-trigger-width)]">
                        <SelectItem :value="0">Tous les voyages</SelectItem>
                        <SelectItem v-for="v in voyagesFinDeCaisse" :key="v.voyage_id" :value="v.voyage_id" class="*:[span]:last:block *:[span]:last:truncate">
                            {{ v.itineraire }} — {{ v.heure_depart }} · {{ v.places_vendues }}/{{ v.places_total }}
                        </SelectItem>
                    </SelectContent>
                </Select>

                <p v-if="voyageFinDeCaisseChoisi" class="rounded-md bg-muted/40 px-3 py-2 text-sm">
                    Places vendues : <span class="font-semibold">{{ voyageFinDeCaisseChoisi.places_vendues }}</span>
                    · Places restantes : <span class="font-semibold">{{ voyageFinDeCaisseChoisi.places_total - voyageFinDeCaisseChoisi.places_vendues }}</span>
                </p>

                <div v-if="rapportFinDeCaisse" class="space-y-2 text-sm">
                    <div v-for="v in rapportFinDeCaisse.voyages" :key="v.trajet_id" class="rounded-md border px-3 py-2">
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="font-medium">{{ v.trajet }}</p>
                                <p class="text-xs text-muted-foreground">{{ v.heure_depart }} · {{ v.nombre_tickets }} ticket(s)</p>
                            </div>
                            <span class="font-semibold">{{ formatMontant(v.montant_total) }}</span>
                        </div>
                        <p v-if="v.commission_total > 0" class="mt-1 flex justify-between text-xs text-muted-foreground">
                            <span>dont commission courtier</span>
                            <span>-{{ formatMontant(v.commission_total) }}</span>
                        </p>
                    </div>
                    <p v-if="rapportFinDeCaisse.voyages.length === 0" class="text-sm text-muted-foreground">
                        Aucune vente pour cette date.
                    </p>
                    <div class="space-y-1 border-t pt-2">
                        <div class="flex items-start justify-between gap-4 text-muted-foreground">
                            <span class="shrink-0">Agent(s)</span>
                            <span class="text-right font-medium text-foreground">{{ rapportFinDeCaisse.agents.join(', ') || '—' }}</span>
                        </div>
                        <div class="flex items-center justify-between text-muted-foreground">
                            <span>Total billets</span>
                            <span class="font-medium text-foreground">{{ formatMontant(rapportFinDeCaisse.montant_ventes_total) }}</span>
                        </div>
                        <div class="flex items-center justify-between text-muted-foreground">
                            <span>Total timbre</span>
                            <span class="font-medium text-foreground">{{ formatMontant(rapportFinDeCaisse.timbre_total) }}</span>
                        </div>
                        <div class="flex items-center justify-between text-muted-foreground">
                            <span>Total commission</span>
                            <span class="font-medium text-foreground">{{ formatMontant(rapportFinDeCaisse.commission_total) }}</span>
                        </div>
                        <div class="flex items-center justify-between font-semibold">
                            <span>{{ rapportFinDeCaisse.nombre_tickets_total }} ticket(s) au total</span>
                            <span class="text-lg">{{ formatMontant(totalAnime) }}</span>
                        </div>
                        <div class="flex items-center justify-between font-semibold text-emerald-700 dark:text-emerald-400">
                            <span>Net après déduction</span>
                            <span class="text-lg">{{ formatMontant(rapportFinDeCaisse.montant_net_total) }}</span>
                        </div>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" @click="finDeCaisseOuvert = false">Fermer</Button>
                    <Button :disabled="impressionEnCours" @click="imprimerFinDeCaisse">
                        <Spinner v-if="impressionEnCours" />
                        <Printer v-else />
                        {{ impressionEnCours ? 'Impression…' : 'Imprimer' }}
                    </Button>
                </DialogFooter>
                <p v-if="erreurImpression" class="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {{ erreurImpression }}
                </p>
            </DialogContent>
        </Dialog>

        <div class="zone-impression hidden print:block">
            <FinDeCaisseRecu
                v-if="finDeCaisseOuvert"
                :rapport="rapportFinDeCaisse"
                :agence="config.agence ? `${config.agence.nom} — ${config.agence.ville_nom}` : ''"
                :caissier="session.nom"
                :voyage="voyageFinDeCaisseLibelle"
                :places-vendues="voyageFinDeCaisseChoisi?.places_vendues"
                :places-restantes="voyageFinDeCaisseChoisi ? voyageFinDeCaisseChoisi.places_total - voyageFinDeCaisseChoisi.places_vendues : undefined"
            />
        </div>
    </AppSidebarLayout>
</template>
