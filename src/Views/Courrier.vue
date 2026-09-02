<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { BriefcaseBusiness, ClipboardList, FileText, Mail, Package, Plus, Printer, Send } from '@lucide/vue';
import AppSidebarLayout from '@/Layouts/app/AppSidebarLayout.vue';
import CourrierForm from '@/Components/courrier/CourrierForm.vue';
import CourrierRecu from '@/Components/courrier/CourrierRecu.vue';
import FinDeCaisseSimpleRecu from '@/Components/FinDeCaisseSimpleRecu.vue';
import GestionLotsDialog from '@/Components/lots/GestionLotsDialog.vue';
import RecupererVentesButton from '@/Components/RecupererVentesButton.vue';
import { Button } from '@/Components/ui/button';
import { Input } from '@/Components/ui/input';
import { Spinner } from '@/Components/ui/spinner';
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
import { useCompteurAnime } from '@/composables/useCompteurAnime';
import { choisirSalutation } from '@/composables/useSalutation';
import { useDateCaisseFiltre } from '@/composables/useDateCaisseFiltre';
import { useConfigStore } from '@/Stores/config';
import { hauteurZoneImpressionMm } from '@/lib/impression';
import { useSessionStore } from '@/Stores/session';
import type { CourrierDuJour } from '@/types/courrier';
import { creerProtectionChargement, insererEnTeteSansDoublon } from '@/lib/listeTransactions';

const config = useConfigStore();
const session = useSessionStore();

type RapportCourrierDestination = { destination_id: number | null; destination: string; nombre_courriers: number; nombre_colis: number; montant_total: number; valeur_colis: number };
type RapportFinDeCaisseCourrier = {
    date: string;
    destinations: RapportCourrierDestination[];
    nombre_courriers: number;
    nombre_colis: number;
    montant_total: number;
    valeur_colis: number;
    agents: string[];
};

// Les agents ne voient que leurs propres opérations ; admin et chef de gare
// voient tout (même règle que la vente de tickets).
const userIdFiltre = computed(() => ['super_admin', 'admin', 'chef_gare'].includes(session.role) ? null : session.userId);

const { dateFiltre, aujourdhui, actualiserJourDeCaisse } = useDateCaisseFiltre();

const courriers = ref<CourrierDuJour[]>([]);
const protectionChargementCourriers = creerProtectionChargement();
const recherche = ref('');
// Filtre local : n° courrier, destinataire ou expéditeur (nom/prénoms/téléphone).
const courriersAffiches = computed(() => {
    const t = recherche.value.trim().toLowerCase();
    if (!t) return courriers.value;
    return courriers.value.filter((c) =>
        (c.numero_courrier ?? '').toLowerCase().includes(t) ||
        (c.destinataire ?? '').toLowerCase().includes(t) ||
        (c.destinataire_telephone ?? '').toLowerCase().includes(t) ||
        (c.expediteur ?? '').toLowerCase().includes(t) ||
        (c.expediteur_telephone ?? '').toLowerCase().includes(t),
    );
});
const totalDuJour = computed(() => courriers.value.reduce((s, c) => s + c.montant_total, 0));
const valeurDuJour = computed(() => courriers.value.reduce((s, c) => s + c.montant_colis, 0));

const dialogOuvert = ref(false);
const courrierForm = ref<InstanceType<typeof CourrierForm> | null>(null);

async function charger() {
    const revision = protectionChargementCourriers.commencer();
    if (!session.agenceId) {
        if (protectionChargementCourriers.estCourant(revision)) courriers.value = [];
        return;
    }
    const donnees = (await window.api.courrier.duJour(session.agenceId, dateFiltre.value, userIdFiltre.value)) as CourrierDuJour[];
    if (protectionChargementCourriers.estCourant(revision)) courriers.value = donnees;
}

function ouvrir() {
    courrierForm.value?.resetTout();
    dialogOuvert.value = true;
}

function onEnregistre(courrier: CourrierDuJour) {
    actualiserJourDeCaisse();
    if (dateFiltre.value === aujourdhui()) {
        protectionChargementCourriers.invalider();
        courriers.value = insererEnTeteSansDoublon(courriers.value, courrier);
    }
}

watch(dateFiltre, charger);
onMounted(charger);

const finDeCaisseOuvert = ref(false);
const rapportFinDeCaisse = ref<RapportFinDeCaisseCourrier | null>(null);
const erreurImpression = ref('');
const impressionEnCours = ref(false);
const salutationFinDeCaisse = ref('');
const { valeur: totalAnime, animerVers: animerTotal } = useCompteurAnime();
const lignesRapportFinDeCaisse = computed(() => rapportFinDeCaisse.value?.destinations.map((destination) => ({
    id: destination.destination_id,
    libelle: destination.destination,
    nombre: destination.nombre_courriers,
    montant_total: destination.montant_total,
    complement: `${destination.nombre_colis} colis · valeur ${formatMontant(destination.valeur_colis)}`,
})) ?? []);
const detailsRapportFinDeCaisse = computed(() => {
    const r = rapportFinDeCaisse.value;
    if (!r) return [];
    return [
        { libelle: 'Nombre de colis', valeur: String(r.nombre_colis) },
        { libelle: 'Valeur des colis', valeur: formatMontant(r.valeur_colis) },
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
    rapportFinDeCaisse.value = (await window.api.courrier.finDeCaisse(
        session.agenceId,
        dateFiltre.value,
        voyageFinDeCaisseId.value || null,
        userIdFiltre.value,
    )) as RapportFinDeCaisseCourrier;
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
    voyagesFinDeCaisse.value = (await window.api.vente.voyagesFinDeCaisse(session.agenceId, dateFiltre.value)) as VoyageFinDeCaisse[];
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

// Détails d'un courrier au clic sur une ligne, avec réimpression reçu/étiquette.
interface DetailsCourrier {
    uuid: string;
    numero_courrier: string;
    destination: string;
    agence_arrivee: string | null;
    agence_arrivee_telephone: string | null;
    voyage: string | null;
    expediteur_nom: string;
    expediteur_telephone: string;
    destinataire_nom: string;
    destinataire_telephone: string;
    prix_expedition: number;
    montant_colis: number;
    montant_total: number;
    agence_depart: string | null;
    agence_depart_telephone: string | null;
    agent: string | null;
    created_at: string;
    colis: { nom: string; type: string; quantite: number; montant: number }[];
}
const typeColisLabel: Record<string, string> = {
    petit: 'Petit',
    gros: 'Gros',
    objet_valeur: 'Objet de valeur',
    autre: 'Autre',
};
const detailsOuvert = ref(false);
const courrierDetails = ref<DetailsCourrier | null>(null);
const lotsOuvert = ref(false);
const erreurReimpression = ref('');
const partieReimpression = ref<'tout' | 'recu' | 'etiquette'>('tout');

function formatDateHeure(iso: string) {
    const d = new Date(iso);
    return Number.isNaN(d.getTime())
        ? iso
        : d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

const recuReimpression = computed(() => {
    const c = courrierDetails.value;
    if (!c) return null;
    return {
        numero_courrier: c.numero_courrier,
        destination: c.destination,
        agence_arrivee: c.agence_arrivee,
        agence_arrivee_telephone: c.agence_arrivee_telephone,
        voyage: c.voyage,
        expediteur: `${c.expediteur_nom} (${c.expediteur_telephone})`.trim(),
        expediteur_nom: c.expediteur_nom,
        expediteur_telephone: c.expediteur_telephone,
        destinataire: `${c.destinataire_nom} (${c.destinataire_telephone})`.trim(),
        destinataire_nom: c.destinataire_nom,
        destinataire_telephone: c.destinataire_telephone,
        colis: c.colis.map((ligne) => ({ ...ligne, type: typeColisLabel[ligne.type] ?? ligne.type })),
        prix_expedition: c.prix_expedition,
        montant_colis: c.montant_colis,
        montant_total: c.montant_total,
        agence_depart: c.agence_depart,
        agence_depart_telephone: c.agence_depart_telephone,
        agent: c.agent,
        created_at: formatDateHeure(c.created_at),
        compagnie: config.compagnie,
    };
});

async function ouvrirDetails(c: CourrierDuJour) {
    erreurReimpression.value = '';
    courrierDetails.value = (await window.api.courrier.details(c.uuid)) as DetailsCourrier | null;
    detailsOuvert.value = courrierDetails.value !== null;
}

async function reimprimer(partie: 'recu' | 'etiquette') {
    erreurReimpression.value = '';
    partieReimpression.value = partie;
    try {
        await nextTick();
        const impression = await window.api.impression.imprimerRecu(hauteurZoneImpressionMm());
        if (!impression.ok) {
            erreurReimpression.value = impression.erreur ?? "L'impression n'a pas pu être lancée.";
        }
    } finally {
        partieReimpression.value = 'tout';
    }
}

const formatMontant = (m: number) => new Intl.NumberFormat('fr-FR').format(m) + ' FCFA';
</script>

<template>
    <AppSidebarLayout titre="Courrier">
        <div class="flex flex-col gap-5">
            <div class="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 class="flex items-center gap-2 text-xl font-semibold"><Send class="size-5" /> Courrier</h1>
                    <p class="text-[0.95rem] text-muted-foreground">Suivez les courriers du jour et envoyez-en un nouveau</p>
                </div>

                <!-- flex-wrap : sur les petits écrans (postes de bureau), les
                     boutons passent à la ligne au lieu de déborder du cadre. -->
                <div class="flex w-full flex-wrap items-center gap-2 lg:w-auto">
                    <Input v-model="dateFiltre" type="date" class="h-10 w-44 text-base" />
                    <RecupererVentesButton section="courrier" :date="dateFiltre" @recupere="charger" />
                    <Button variant="outline" :disabled="!session.agenceId || !session.userId" @click="lotsOuvert = true">
                        <FileText />
                        Bordereaux
                    </Button>
                    <Button variant="outline" :disabled="!session.agenceId" @click="ouvrirFinDeCaisse">
                        <ClipboardList />
                        Fin de caisse
                    </Button>
                    <Button :disabled="!session.agenceId" @click="ouvrir">
                        <Plus />
                        Envoyer un courrier
                    </Button>
                </div>
            </div>

            <section class="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div class="rounded-lg border border-violet-200/70 bg-card p-4 shadow-sm dark:border-violet-900/60">
                    <div class="flex items-center justify-between gap-3">
                        <p class="text-sm font-medium text-muted-foreground">Courriers</p>
                        <span class="rounded-md bg-violet-500/10 p-2 text-violet-600 dark:text-violet-300">
                            <Mail class="size-5" />
                        </span>
                    </div>
                    <p class="mt-3 text-2xl font-semibold">{{ courriers.length }}</p>
                    <p class="mt-1 text-sm text-muted-foreground">{{ dateFiltre === aujourdhui() ? "Aujourd'hui" : dateFiltre }}</p>
                </div>

                <div class="rounded-lg border border-emerald-200/70 bg-card p-4 shadow-sm dark:border-emerald-900/60">
                    <div class="flex items-center justify-between gap-3">
                        <p class="text-sm font-medium text-muted-foreground">Frais total</p>
                        <span class="rounded-md bg-emerald-500/10 p-2 text-emerald-600 dark:text-emerald-300">
                            <BriefcaseBusiness class="size-5" />
                        </span>
                    </div>
                    <p class="mt-3 text-2xl font-semibold">{{ formatMontant(totalDuJour) }}</p>
                    <p class="mt-1 text-sm text-muted-foreground">Frais d'expédition encaissés</p>
                </div>

                <div class="rounded-lg border border-amber-200/80 bg-card p-4 shadow-sm dark:border-amber-900/60">
                    <div class="flex items-center justify-between gap-3">
                        <p class="text-sm font-medium text-muted-foreground">Valeur des colis</p>
                        <span class="rounded-md bg-amber-500/10 p-2 text-amber-600 dark:text-amber-300">
                            <Package class="size-5" />
                        </span>
                    </div>
                    <p class="mt-3 text-2xl font-semibold">{{ formatMontant(valeurDuJour) }}</p>
                    <p class="mt-1 text-sm text-muted-foreground">Valeur déclarée, non encaissée</p>
                </div>
            </section>

            <div class="overflow-hidden rounded-lg border bg-card p-5 shadow-sm">
                <Input v-model="recherche" placeholder="Rechercher : n° courrier, destinataire, expéditeur, téléphone…" class="mb-3 h-10 max-w-md text-base" />

                <p v-if="courriersAffiches.length === 0" class="rounded-md bg-muted/40 px-4 py-6 text-center text-[0.95rem] text-muted-foreground">{{ recherche ? 'Aucun résultat pour cette recherche.' : 'Aucun courrier pour cette date.' }}</p>

                <div v-else class="overflow-x-auto">
                <table class="w-full text-[0.95rem]">
                    <thead class="bg-muted/40">
                        <tr class="border-b text-left text-muted-foreground">
                            <th class="px-3 py-3 font-medium">Heure</th>
                            <th class="px-3 py-3 font-medium">N°</th>
                            <th class="px-3 py-3 font-medium">Destination</th>
                            <th class="px-3 py-3 font-medium">Destinataire</th>
                            <th class="px-3 py-3 text-right font-medium">Montant</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="c in courriersAffiches" :key="c.uuid" class="cursor-pointer border-b last:border-0 hover:bg-muted/30" title="Voir les détails" @click="ouvrirDetails(c)">
                            <td class="px-3 py-3">{{ c.heure }}</td>
                            <td class="px-3 py-3 font-mono">{{ c.numero_courrier }}</td>
                            <td class="px-3 py-3">{{ c.destination }}</td>
                            <td class="px-3 py-3">{{ c.destinataire }}</td>
                            <td class="px-3 py-3 text-right font-semibold">{{ formatMontant(c.montant_total) }}</td>
                        </tr>
                    </tbody>
                </table>
                </div>
            </div>
        </div>

        <Dialog v-model:open="dialogOuvert">
            <!-- Hauteur fixe + overflow-hidden : header et footer restent visibles,
                 seul le corps du formulaire défile. -->
            <DialogContent class="flex h-[90vh] w-[92vw] max-w-5xl flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
                <DialogHeader class="shrink-0 border-b bg-background px-6 py-4">
                    <DialogTitle class="flex items-center gap-2"><Send class="size-5" /> Envoyer un courrier</DialogTitle>
                </DialogHeader>
                <CourrierForm ref="courrierForm" @enregistre="onEnregistre" @fermer="dialogOuvert = false" />
            </DialogContent>
        </Dialog>

        <Dialog v-model:open="finDeCaisseOuvert">
            <DialogContent class="max-h-[92vh] w-[92vw] max-w-lg overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle class="flex items-center gap-2"><ClipboardList class="size-5" /> Fin de caisse — {{ dateFiltre }}</DialogTitle>
                </DialogHeader>
                <p class="text-sm text-muted-foreground">{{ salutationFinDeCaisse }}, {{ session.nom }} ! Voici le récap 📬</p>
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
                                {{ destination.nombre_courriers }} courrier(s) · {{ destination.nombre_colis }} colis
                                · valeur {{ formatMontant(destination.valeur_colis) }}
                            </p>
                        </div>
                        <span class="font-semibold">{{ formatMontant(destination.montant_total) }}</span>
                    </div>
                    <p v-if="rapportFinDeCaisse.destinations.length === 0" class="text-sm text-muted-foreground">
                        {{ voyageFinDeCaisseId ? 'Aucun courrier pour ce voyage à cette date.' : 'Aucun courrier pour cette date.' }}
                    </p>
                    <div class="space-y-1 border-t pt-2">
                        <div class="flex items-start justify-between gap-4 text-muted-foreground">
                            <span class="shrink-0">Agent(s)</span>
                            <span class="text-right font-medium text-foreground">{{ rapportFinDeCaisse.agents.join(', ') || '—' }}</span>
                        </div>
                        <div class="flex items-center justify-between text-muted-foreground">
                            <span>Nombre de colis</span><span>{{ rapportFinDeCaisse.nombre_colis }}</span>
                        </div>
                        <div class="flex items-center justify-between text-muted-foreground">
                            <span>Valeur des colis (déclarée)</span><span>{{ formatMontant(rapportFinDeCaisse.valeur_colis) }}</span>
                        </div>
                        <div class="flex items-center justify-between font-semibold">
                            <span>{{ rapportFinDeCaisse.nombre_courriers }} courrier(s) au total</span>
                            <span class="text-lg">{{ formatMontant(totalAnime) }}</span>
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

        <!-- Détails d'un courrier : réimpression de l'étiquette. -->
        <Dialog v-model:open="detailsOuvert">
            <DialogContent class="max-h-[92vh] w-[92vw] max-w-2xl overflow-y-auto sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle class="flex items-center gap-2"><Send class="size-5" /> Courrier {{ courrierDetails?.numero_courrier }}</DialogTitle>
                </DialogHeader>
                <div v-if="courrierDetails" class="space-y-4">
                    <div class="rounded-xl border p-4">
                        <p class="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Destination</p>
                        <p class="text-base font-semibold">{{ courrierDetails.destination }}<span v-if="courrierDetails.agence_arrivee" class="font-normal text-muted-foreground"> — {{ courrierDetails.agence_arrivee }}</span></p>
                        <p class="text-sm text-muted-foreground">{{ courrierDetails.voyage ? `Voyage du ${courrierDetails.voyage}` : 'Aucun voyage précis' }}</p>
                    </div>

                    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div class="rounded-xl border p-4">
                            <p class="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Expéditeur</p>
                            <p class="text-base font-semibold">{{ courrierDetails.expediteur_nom }}</p>
                            <p class="text-sm text-muted-foreground">{{ courrierDetails.expediteur_telephone }}</p>
                        </div>
                        <div class="rounded-xl border p-4">
                            <p class="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Destinataire</p>
                            <p class="text-base font-semibold">{{ courrierDetails.destinataire_nom }}</p>
                            <p class="text-sm text-muted-foreground">{{ courrierDetails.destinataire_telephone }}</p>
                        </div>
                    </div>

                    <div class="rounded-xl border p-4">
                        <p class="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Colis</p>
                        <div class="space-y-2">
                            <div v-for="(ligne, i) in courrierDetails.colis" :key="i" class="flex items-center justify-between gap-3">
                                <span class="font-medium">{{ ligne.quantite }} × {{ ligne.nom }} <span class="font-normal text-muted-foreground">({{ typeColisLabel[ligne.type] ?? ligne.type }})</span></span>
                                <span class="shrink-0 font-medium">{{ formatMontant(ligne.montant) }}</span>
                            </div>
                        </div>
                        <div class="mt-3 flex items-center justify-between border-t pt-2 text-sm">
                            <span class="text-muted-foreground">Valeur des colis (déclarée)</span>
                            <span class="font-semibold">{{ formatMontant(courrierDetails.montant_colis) }}</span>
                        </div>
                    </div>

                    <div class="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/30 px-4 py-3">
                        <div class="text-sm text-muted-foreground">
                            Enregistré le {{ formatDateHeure(courrierDetails.created_at) }}<span v-if="courrierDetails.agent"> par {{ courrierDetails.agent }}</span>
                        </div>
                        <div class="text-right">
                            <p class="text-sm text-muted-foreground">Frais d'expédition (encaissé)</p>
                            <p class="text-2xl font-bold">{{ formatMontant(courrierDetails.montant_total) }}</p>
                        </div>
                    </div>
                </div>
                <p v-if="erreurReimpression" class="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {{ erreurReimpression }}
                </p>
                <DialogFooter class="gap-2">
                    <Button variant="outline" @click="detailsOuvert = false">Fermer</Button>
                    <Button @click="reimprimer('etiquette')"><Printer /> Réimprimer étiquette (talon)</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        <GestionLotsDialog
            v-model:open="lotsOuvert"
            type="courrier"
            :date="dateFiltre"
            :agence-id="session.agenceId"
            :user-id="session.userId"
        />

        <div class="zone-impression hidden print:block">
            <FinDeCaisseSimpleRecu
                v-if="finDeCaisseOuvert && rapportFinDeCaisse"
                titre="FIN DE CAISSE — COURRIER"
                :agence="config.agence ? `${config.agence.nom} — ${config.agence.ville_nom}` : ''"
                :caissier="session.nom"
                :date="rapportFinDeCaisse.date"
                libelle-compteur="Nombre de courriers"
                :nombre="rapportFinDeCaisse.nombre_courriers"
                :montant-total="rapportFinDeCaisse.montant_total"
                :voyage="voyageFinDeCaisseLibelle"
                :agents="rapportFinDeCaisse.agents"
                :lignes="lignesRapportFinDeCaisse"
                :details="detailsRapportFinDeCaisse"
            />
            <CourrierRecu v-if="detailsOuvert && recuReimpression" :recu="recuReimpression" :partie="partieReimpression === 'tout' ? 'recu' : partieReimpression" />
        </div>
    </AppSidebarLayout>
</template>
