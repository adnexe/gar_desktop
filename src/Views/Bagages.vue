<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { ClipboardList, Package, Plus, Printer } from '@lucide/vue';
import AppSidebarLayout from '@/Layouts/app/AppSidebarLayout.vue';
import BagageForm from '@/Components/bagage/BagageForm.vue';
import BagageRecu from '@/Components/bagage/BagageRecu.vue';
import FinDeCaisseSimpleRecu from '@/Components/FinDeCaisseSimpleRecu.vue';
import { Button } from '@/Components/ui/button';
import { Input } from '@/Components/ui/input';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/Components/ui/dialog';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/Components/ui/select';
import { useConfigStore } from '@/Stores/config';
import { hauteurZoneImpressionMm } from '@/lib/impression';
import { useSessionStore } from '@/Stores/session';
import type { BagageDuJour } from '@/types/bagage';

const config = useConfigStore();
const session = useSessionStore();

type RapportBagageDestination = { destination_id: number | null; destination: string; nombre_bagages: number; montant_total: number; valeur_totale: number };
type RapportFinDeCaisseBagage = {
    date: string;
    destinations: RapportBagageDestination[];
    nombre_bagages: number;
    montant_total: number;
    valeur_totale: number;
    avec_ticket: number;
    sans_ticket: number;
    agents: string[];
};

// Les agents ne voient que leurs propres opérations ; admin et chef de gare
// voient tout (même règle que la vente de tickets).
const userIdFiltre = computed(() => ['super_admin', 'admin', 'chef_gare'].includes(session.role) ? null : session.userId);

const aujourdhui = () => new Date().toISOString().slice(0, 10);
const dateFiltre = ref(aujourdhui());

const bagages = ref<BagageDuJour[]>([]);
const recherche = ref('');
// Filtre local : n° bagage, n° ticket, nom/prénoms ou téléphone du client.
const bagagesAffiches = computed(() => {
    const t = recherche.value.trim().toLowerCase();
    if (!t) return bagages.value;
    return bagages.value.filter((b) =>
        (b.numero_bagage ?? '').toLowerCase().includes(t) ||
        (b.numero_ticket ?? '').toLowerCase().includes(t) ||
        (b.client ?? '').toLowerCase().includes(t) ||
        (b.client_telephone ?? '').toLowerCase().includes(t),
    );
});
const totalDuJour = computed(() => bagages.value.reduce((s, b) => s + b.montant, 0));

const dialogOuvert = ref(false);
const bagageForm = ref<InstanceType<typeof BagageForm> | null>(null);

async function charger() {
    if (!session.agenceId) {
        bagages.value = [];
        return;
    }
    bagages.value = (await window.api.bagage.duJour(session.agenceId, dateFiltre.value, userIdFiltre.value)) as BagageDuJour[];
}

function ouvrir() {
    bagageForm.value?.resetTout();
    dialogOuvert.value = true;
}

function onEnregistre(bagage: BagageDuJour) {
    if (dateFiltre.value === aujourdhui()) {
        bagages.value.unshift(bagage);
    }
}

watch(dateFiltre, charger);
onMounted(charger);

const finDeCaisseOuvert = ref(false);
const rapportFinDeCaisse = ref<RapportFinDeCaisseBagage | null>(null);
const erreurImpression = ref('');
const lignesRapportFinDeCaisse = computed(() => rapportFinDeCaisse.value?.destinations.map((destination) => ({
    id: destination.destination_id,
    libelle: destination.destination,
    nombre: destination.nombre_bagages,
    montant_total: destination.montant_total,
    complement: destination.valeur_totale ? `Valeur déclarée : ${formatMontant(destination.valeur_totale)}` : undefined,
})) ?? []);
const detailsRapportFinDeCaisse = computed(() => {
    const r = rapportFinDeCaisse.value;
    if (!r) return [];
    return [
        { libelle: 'Avec ticket', valeur: String(r.avec_ticket) },
        { libelle: 'Sans ticket', valeur: String(r.sans_ticket) },
        { libelle: 'Valeur déclarée', valeur: formatMontant(r.valeur_totale) },
    ];
});

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
    rapportFinDeCaisse.value = (await window.api.bagage.finDeCaisse(
        session.agenceId,
        dateFiltre.value,
        voyageFinDeCaisseId.value || null,
        userIdFiltre.value,
    )) as RapportFinDeCaisseBagage;
}

async function ouvrirFinDeCaisse() {
    if (!session.agenceId) return;
    voyageFinDeCaisseId.value = 0;
    voyagesFinDeCaisse.value = (await window.api.vente.voyagesFinDeCaisse(session.agenceId, dateFiltre.value)) as VoyageFinDeCaisse[];
    await chargerRapportFinDeCaisse();
    finDeCaisseOuvert.value = true;
}

watch(voyageFinDeCaisseId, chargerRapportFinDeCaisse);

async function imprimerFinDeCaisse() {
    erreurImpression.value = '';
    await nextTick();
    const impression = await window.api.impression.imprimerRecu();
    if (!impression.ok) {
        erreurImpression.value = impression.erreur ?? "L'impression n'a pas pu être lancée.";
    }
}

// Détails d'un bagage au clic sur une ligne, avec réimpression reçu/talon.
interface DetailsBagage {
    uuid: string;
    numero_bagage: string;
    numero_ticket: string | null;
    numero_place: number | null;
    destination: string | null;
    voyage: string | null;
    client: string | null;
    client_telephone: string | null;
    description: string | null;
    valeur: number | null;
    montant: number;
    agence: string | null;
    agent: string | null;
    created_at: string;
}
const detailsOuvert = ref(false);
const bagageDetails = ref<DetailsBagage | null>(null);
const erreurReimpression = ref('');
const modeReimpression = ref<'recu' | 'talon'>('recu');

function formatDateHeure(iso: string) {
    const d = new Date(iso);
    return Number.isNaN(d.getTime())
        ? iso
        : d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

const recuReimpression = computed(() => {
    const b = bagageDetails.value;
    if (!b) return null;
    return {
        numero_bagage: b.numero_bagage,
        numero_ticket: b.numero_ticket,
        numero_place: b.numero_place,
        reference: b.numero_ticket ? `Ticket ${b.numero_ticket}` : 'Sans ticket',
        destination: b.destination,
        voyage: b.voyage,
        client: b.client,
        valeur: b.valeur,
        montant: b.montant,
        description: b.description,
        agence: b.agence,
        agent: b.agent,
        created_at: formatDateHeure(b.created_at),
        compagnie: config.compagnie,
    };
});

async function ouvrirDetails(b: BagageDuJour) {
    erreurReimpression.value = '';
    bagageDetails.value = (await window.api.bagage.details(b.uuid)) as DetailsBagage | null;
    detailsOuvert.value = bagageDetails.value !== null;
}

async function reimprimer(mode: 'recu' | 'talon') {
    erreurReimpression.value = '';
    modeReimpression.value = mode;
    await nextTick();
    const impression = await window.api.impression.imprimerRecu(hauteurZoneImpressionMm());
    if (!impression.ok) {
        erreurReimpression.value = impression.erreur ?? "L'impression n'a pas pu être lancée.";
    }
}

const formatMontant = (m: number) => new Intl.NumberFormat('fr-FR').format(m) + ' FCFA';
</script>

<template>
    <AppSidebarLayout titre="Bagages">
        <div class="flex flex-col gap-5">
            <div class="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 class="flex items-center gap-2 text-xl font-semibold"><Package class="size-5" /> Bagages</h1>
                    <p class="text-[0.95rem] text-muted-foreground">Suivez les bagages du jour et enregistrez-en un nouveau</p>
                </div>

                <div class="flex items-center gap-2">
                    <Input v-model="dateFiltre" type="date" class="h-10 w-44 text-base" />
                    <Button variant="outline" :disabled="!session.agenceId" @click="ouvrirFinDeCaisse">
                        <ClipboardList />
                        Fin de caisse
                    </Button>
                    <Button :disabled="!session.agenceId" @click="ouvrir">
                        <Plus />
                        Enregistrer un bagage
                    </Button>
                </div>
            </div>

            <div class="overflow-hidden rounded-lg border bg-card p-5 shadow-sm">
                <div class="mb-3 flex items-center justify-between">
                    <p class="text-base font-medium">Bagages du {{ dateFiltre === aujourdhui() ? 'jour' : dateFiltre }}</p>
                    <span class="text-lg font-semibold">Total : {{ formatMontant(totalDuJour) }}</span>
                </div>

                <Input v-model="recherche" placeholder="Rechercher : n° bagage, n° ticket, client, téléphone…" class="mb-3 h-10 max-w-md text-base" />

                <p v-if="bagagesAffiches.length === 0" class="rounded-md bg-muted/40 px-4 py-6 text-center text-[0.95rem] text-muted-foreground">{{ recherche ? 'Aucun résultat pour cette recherche.' : 'Aucun bagage pour cette date.' }}</p>

                <table v-else class="w-full text-[0.95rem]">
                    <thead class="bg-muted/40">
                        <tr class="border-b text-left text-muted-foreground">
                            <th class="px-3 py-3 font-medium">Heure</th>
                            <th class="px-3 py-3 font-medium">N°</th>
                            <th class="px-3 py-3 font-medium">Ticket lié</th>
                            <th class="px-3 py-3 font-medium">Destination</th>
                            <th class="px-3 py-3 font-medium">Description</th>
                            <th class="px-3 py-3 text-right font-medium">Valeur déclarée</th>
                            <th class="px-3 py-3 text-right font-medium">Montant</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="b in bagagesAffiches" :key="b.uuid" class="cursor-pointer border-b last:border-0 hover:bg-muted/30" title="Voir les détails" @click="ouvrirDetails(b)">
                            <td class="px-3 py-3">{{ b.heure }}</td>
                            <td class="px-3 py-3 font-mono">{{ b.numero_bagage }}</td>
                            <td class="px-3 py-3">{{ b.numero_ticket ?? '—' }}</td>
                            <td class="px-3 py-3">{{ b.destination ?? '—' }}</td>
                            <td class="px-3 py-3">{{ b.description ?? '—' }}</td>
                            <td class="px-3 py-3 text-right">{{ b.valeur !== null ? formatMontant(b.valeur) : '—' }}</td>
                            <td class="px-3 py-3 text-right font-semibold">{{ formatMontant(b.montant) }}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>

        <Dialog v-model:open="dialogOuvert">
            <DialogContent class="flex max-h-[92vh] w-[92vw] max-w-4xl flex-col gap-0 overflow-y-auto p-0 sm:max-w-4xl">
                <DialogHeader class="border-b bg-background px-6 py-4">
                    <DialogTitle class="flex items-center gap-2"><Package class="size-5" /> Enregistrer un bagage</DialogTitle>
                </DialogHeader>
                <BagageForm ref="bagageForm" @enregistre="onEnregistre" @fermer="dialogOuvert = false" />
            </DialogContent>
        </Dialog>

        <Dialog v-model:open="finDeCaisseOuvert">
            <DialogContent class="max-h-[92vh] w-[92vw] max-w-lg overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle class="flex items-center gap-2"><ClipboardList class="size-5" /> Fin de caisse — {{ dateFiltre }}</DialogTitle>
                </DialogHeader>
                <Select v-model="voyageFinDeCaisseId">
                    <SelectTrigger class="w-full max-w-full [&>span]:truncate"><SelectValue placeholder="Tous les voyages" /></SelectTrigger>
                    <SelectContent class="max-w-[var(--reka-select-trigger-width)]">
                        <SelectItem :value="0">Tous les voyages</SelectItem>
                        <SelectItem v-for="v in voyagesFinDeCaisse" :key="v.voyage_id" :value="v.voyage_id" class="*:[span]:last:block *:[span]:last:truncate">
                            {{ v.itineraire }} — {{ v.heure_depart }} · {{ v.places_vendues }}/{{ v.places_total }}
                        </SelectItem>
                    </SelectContent>
                </Select>

                <div v-if="rapportFinDeCaisse" class="space-y-2 text-sm">
                    <div v-for="destination in rapportFinDeCaisse.destinations" :key="destination.destination_id ?? destination.destination" class="flex items-center justify-between rounded-md border px-3 py-2">
                        <div>
                            <p class="font-medium">{{ destination.destination }}</p>
                            <p class="text-xs text-muted-foreground">
                                {{ destination.nombre_bagages }} bagage(s)
                                <span v-if="destination.valeur_totale"> · valeur déclarée {{ formatMontant(destination.valeur_totale) }}</span>
                            </p>
                        </div>
                        <span class="font-semibold">{{ formatMontant(destination.montant_total) }}</span>
                    </div>
                    <p v-if="rapportFinDeCaisse.destinations.length === 0" class="text-sm text-muted-foreground">
                        {{ voyageFinDeCaisseId ? 'Aucun bagage pour ce voyage à cette date.' : 'Aucun bagage pour cette date.' }}
                    </p>
                    <div class="space-y-1 border-t pt-2">
                        <div class="flex items-start justify-between gap-4 text-muted-foreground">
                            <span class="shrink-0">Agent(s)</span>
                            <span class="text-right font-medium text-foreground">{{ rapportFinDeCaisse.agents.join(', ') || '—' }}</span>
                        </div>
                        <div class="flex items-center justify-between text-muted-foreground">
                            <span>Avec ticket</span><span>{{ rapportFinDeCaisse.avec_ticket }}</span>
                        </div>
                        <div class="flex items-center justify-between text-muted-foreground">
                            <span>Sans ticket</span><span>{{ rapportFinDeCaisse.sans_ticket }}</span>
                        </div>
                        <div class="flex items-center justify-between text-muted-foreground">
                            <span>Valeur déclarée totale</span><span>{{ formatMontant(rapportFinDeCaisse.valeur_totale) }}</span>
                        </div>
                        <div class="flex items-center justify-between font-semibold">
                            <span>{{ rapportFinDeCaisse.nombre_bagages }} bagage(s) au total</span>
                            <span class="text-lg">{{ formatMontant(rapportFinDeCaisse.montant_total) }}</span>
                        </div>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" @click="finDeCaisseOuvert = false">Fermer</Button>
                    <Button @click="imprimerFinDeCaisse"><Printer /> Imprimer</Button>
                </DialogFooter>
                <p v-if="erreurImpression" class="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {{ erreurImpression }}
                </p>
            </DialogContent>
        </Dialog>

        <!-- Détails d'un bagage : réimpression du talon. -->
        <Dialog v-model:open="detailsOuvert">
            <DialogContent class="w-[92vw] max-w-2xl sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle class="flex items-center gap-2"><Package class="size-5" /> Bagage {{ bagageDetails?.numero_bagage }}</DialogTitle>
                </DialogHeader>
                <div v-if="bagageDetails" class="space-y-4">
                    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div class="rounded-xl border p-4">
                            <p class="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Client</p>
                            <p class="text-base font-semibold">{{ bagageDetails.client ?? 'Client anonyme' }}</p>
                            <p v-if="bagageDetails.client_telephone" class="text-sm text-muted-foreground">{{ bagageDetails.client_telephone }}</p>
                            <p class="mt-2 text-sm">
                                <span class="text-muted-foreground">Ticket lié : </span>
                                <span class="font-medium">{{ bagageDetails.numero_ticket ?? 'Sans ticket' }}</span>
                                <span v-if="bagageDetails.numero_place" class="font-medium"> · Place {{ bagageDetails.numero_place }}</span>
                            </p>
                        </div>
                        <div class="rounded-xl border p-4">
                            <p class="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Trajet</p>
                            <p class="text-base font-semibold">{{ bagageDetails.destination ?? 'Destination non renseignée' }}</p>
                            <p class="text-sm text-muted-foreground">{{ bagageDetails.voyage ? `Voyage du ${bagageDetails.voyage}` : 'Aucun voyage précis' }}</p>
                        </div>
                    </div>

                    <div class="rounded-xl border p-4">
                        <p class="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Bagage</p>
                        <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
                            <div>
                                <p class="text-sm text-muted-foreground">Contenu</p>
                                <p class="font-medium">{{ bagageDetails.description ?? '—' }}</p>
                            </div>
                            <div>
                                <p class="text-sm text-muted-foreground">Valeur déclarée</p>
                                <p class="font-medium">{{ bagageDetails.valeur !== null ? formatMontant(bagageDetails.valeur) : '—' }}</p>
                            </div>
                            <div>
                                <p class="text-sm text-muted-foreground">Enregistré le</p>
                                <p class="font-medium">{{ formatDateHeure(bagageDetails.created_at) }}</p>
                                <p v-if="bagageDetails.agent" class="text-sm text-muted-foreground">par {{ bagageDetails.agent }}</p>
                            </div>
                        </div>
                    </div>

                    <div class="flex items-center justify-between rounded-xl border bg-muted/30 px-4 py-3">
                        <span class="font-medium">Montant payé</span>
                        <span class="text-2xl font-bold">{{ formatMontant(bagageDetails.montant) }}</span>
                    </div>
                </div>
                <p v-if="erreurReimpression" class="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {{ erreurReimpression }}
                </p>
                <DialogFooter class="gap-2">
                    <Button variant="outline" @click="detailsOuvert = false">Fermer</Button>
                    <Button @click="reimprimer('talon')"><Printer /> Réimprimer talon</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        <div class="zone-impression hidden print:block">
            <FinDeCaisseSimpleRecu
                v-if="finDeCaisseOuvert && rapportFinDeCaisse"
                titre="FIN DE CAISSE — BAGAGES"
                :agence="config.agence ? `${config.agence.nom} — ${config.agence.ville_nom}` : ''"
                :caissier="session.nom"
                :date="rapportFinDeCaisse.date"
                libelle-compteur="Nombre de bagages"
                :nombre="rapportFinDeCaisse.nombre_bagages"
                :montant-total="rapportFinDeCaisse.montant_total"
                :voyage="voyageFinDeCaisseLibelle"
                :agents="rapportFinDeCaisse.agents"
                :lignes="lignesRapportFinDeCaisse"
                :details="detailsRapportFinDeCaisse"
            />
            <BagageRecu v-if="detailsOuvert && recuReimpression" :recu="recuReimpression" :mode="modeReimpression" />
        </div>
    </AppSidebarLayout>
</template>
