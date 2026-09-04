<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { Boxes, BriefcaseBusiness, ClipboardList, Globe2, Package, Plus, Printer, Send } from '@lucide/vue';
import AppSidebarLayout from '@/Layouts/app/AppSidebarLayout.vue';
import CourrierInternationalForm from '@/Components/courrier-international/CourrierInternationalForm.vue';
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
import { choisirSalutation } from '@/composables/useSalutation';
import { useCompteurAnime } from '@/composables/useCompteurAnime';
import { useDateCaisseFiltre } from '@/composables/useDateCaisseFiltre';
import { hauteurZoneImpressionMm } from '@/lib/impression';
import { construireLienSuiviDepuisPoste } from '@/lib/suiviPublic';
import { useConfigStore } from '@/Stores/config';
import { useSessionStore } from '@/Stores/session';
import type { CourrierInternationalDuJour } from '@/types/courrier-international';
import { creerProtectionChargement, insererEnTeteSansDoublon } from '@/lib/listeTransactions';

type RapportDestination = { destination: string; nombre_courriers: number; nombre_colis: number; montant_total: number; valeur_colis: number };
type RapportFinDeCaisse = {
    date: string;
    destinations: RapportDestination[];
    nombre_courriers: number;
    nombre_colis: number;
    montant_total: number;
    valeur_colis: number;
    agents: string[];
};
interface DetailsCourrierInternational {
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
    colis: { nom: string; type: string; quantite: number; montant: number; poids_kg?: number | null }[];
}

const config = useConfigStore();
const session = useSessionStore();
const userIdFiltre = computed(() => ['super_admin', 'admin', 'chef_gare'].includes(session.role) ? null : session.userId);

const { dateFiltre, aujourdhui, actualiserJourDeCaisse } = useDateCaisseFiltre();
const courriers = ref<CourrierInternationalDuJour[]>([]);
const protectionChargementCourriers = creerProtectionChargement();
const recherche = ref('');
const dialogOuvert = ref(false);
const lotsOuvert = ref(false);
const form = ref<InstanceType<typeof CourrierInternationalForm> | null>(null);

const courriersAffiches = computed(() => {
    const t = recherche.value.trim().toLowerCase();
    if (!t) return courriers.value;
    return courriers.value.filter((c) =>
        (c.numero_courrier ?? '').toLowerCase().includes(t) ||
        (c.destination ?? '').toLowerCase().includes(t) ||
        (c.destinataire ?? '').toLowerCase().includes(t) ||
        (c.destinataire_telephone ?? '').toLowerCase().includes(t) ||
        (c.expediteur ?? '').toLowerCase().includes(t) ||
        (c.expediteur_telephone ?? '').toLowerCase().includes(t),
    );
});
const totalDuJour = computed(() => courriers.value.reduce((s, c) => s + c.montant_total, 0));
const valeurDuJour = computed(() => courriers.value.reduce((s, c) => s + c.valeur_colis, 0));

async function charger() {
    const revision = protectionChargementCourriers.commencer();
    if (!session.agenceId) {
        if (protectionChargementCourriers.estCourant(revision)) courriers.value = [];
        return;
    }
    const donnees = (await window.api.courrierInternational.duJour(session.agenceId, dateFiltre.value, userIdFiltre.value)) as CourrierInternationalDuJour[];
    if (protectionChargementCourriers.estCourant(revision)) courriers.value = donnees;
}

function ouvrir() {
    form.value?.resetTout();
    dialogOuvert.value = true;
}

function onEnregistre(courrier: CourrierInternationalDuJour) {
    actualiserJourDeCaisse();
    if (dateFiltre.value === aujourdhui()) {
        protectionChargementCourriers.invalider();
        courriers.value = insererEnTeteSansDoublon(courriers.value, courrier);
    }
}

watch(dateFiltre, charger);
onMounted(charger);

const finDeCaisseOuvert = ref(false);
const rapportFinDeCaisse = ref<RapportFinDeCaisse | null>(null);
const erreurImpression = ref('');
const impressionEnCours = ref(false);
const salutationFinDeCaisse = ref('');
const { valeur: totalAnime, animerVers: animerTotal } = useCompteurAnime();
const lignesRapportFinDeCaisse = computed(() => rapportFinDeCaisse.value?.destinations.map((destination) => ({
    id: null,
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
        { libelle: 'Valeur déclarée', valeur: formatMontant(r.valeur_colis) },
    ];
});

async function ouvrirFinDeCaisse() {
    if (!session.agenceId) return;
    salutationFinDeCaisse.value = choisirSalutation();
    rapportFinDeCaisse.value = null;
    finDeCaisseOuvert.value = true;
    rapportFinDeCaisse.value = (await window.api.courrierInternational.finDeCaisse(
        session.agenceId,
        dateFiltre.value,
        userIdFiltre.value,
    )) as RapportFinDeCaisse;
    animerTotal(rapportFinDeCaisse.value.montant_total);
}

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

const detailsOuvert = ref(false);
const courrierDetails = ref<DetailsCourrierInternational | null>(null);
const erreurReimpression = ref('');
const partieReimpression = ref<'tout' | 'recu' | 'etiquette'>('tout');
const suiviUrlReimpression = ref<string | null>(null);
const typeLabel: Record<string, string> = {
    document: 'Document',
    colis: 'Colis',
    carton: 'Carton',
    objet_valeur: 'Objet de valeur',
    autre: 'Autre',
};

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
        uuid: c.uuid,
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
        colis: c.colis.map((ligne) => ({ ...ligne, type: typeLabel[ligne.type] ?? ligne.type })),
        prix_expedition: c.prix_expedition,
        montant_colis: c.montant_colis,
        montant_total: c.montant_total,
        agence_depart: c.agence_depart,
        agence_depart_telephone: c.agence_depart_telephone,
        agent: c.agent,
        created_at: formatDateHeure(c.created_at),
        suivi_url: suiviUrlReimpression.value,
        compagnie: config.compagnie,
    };
});

async function ouvrirDetails(c: CourrierInternationalDuJour) {
    erreurReimpression.value = '';
    courrierDetails.value = (await window.api.courrierInternational.details(c.uuid)) as DetailsCourrierInternational | null;
    suiviUrlReimpression.value = courrierDetails.value
        ? await construireLienSuiviDepuisPoste('courrier-international', courrierDetails.value.numero_courrier, courrierDetails.value.uuid)
        : null;
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
    <AppSidebarLayout titre="Courrier international">
        <div class="flex flex-col gap-5">
            <div class="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 class="flex items-center gap-2 text-xl font-semibold"><Globe2 class="size-5" /> Courrier international</h1>
                    <p class="text-sm text-muted-foreground">Suivez les envois internationaux et imprimez les reçus.</p>
                </div>
                <div class="flex flex-wrap items-center gap-2">
                    <Input v-model="dateFiltre" type="date" class="h-10 w-44" />
                    <RecupererVentesButton section="courrier_international" :date="dateFiltre" @recupere="charger" />
                    <Button variant="outline" @click="lotsOuvert = true">
                        <Boxes />
                        Bordereaux
                    </Button>
                    <Button variant="outline" @click="ouvrirFinDeCaisse">
                        <ClipboardList />
                        Fin de caisse
                    </Button>
                    <Button @click="ouvrir">
                        <Plus />
                        Nouvel envoi
                    </Button>
                </div>
            </div>

            <section class="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div class="rounded-lg border border-sky-200/70 bg-card p-4 shadow-sm dark:border-sky-900/60">
                    <div class="flex items-center justify-between gap-3">
                        <p class="text-sm font-medium text-muted-foreground">Frais encaissés</p>
                        <span class="rounded-md bg-sky-500/10 p-2 text-sky-600"><BriefcaseBusiness class="size-5" /></span>
                    </div>
                    <p class="mt-3 text-2xl font-semibold">{{ formatMontant(totalDuJour) }}</p>
                    <p class="mt-1 text-sm text-muted-foreground">Données de la date sélectionnée</p>
                </div>
                <div class="rounded-lg border border-emerald-200/70 bg-card p-4 shadow-sm dark:border-emerald-900/60">
                    <div class="flex items-center justify-between gap-3">
                        <p class="text-sm font-medium text-muted-foreground">Envois</p>
                        <span class="rounded-md bg-emerald-500/10 p-2 text-emerald-600"><Send class="size-5" /></span>
                    </div>
                    <p class="mt-3 text-2xl font-semibold">{{ courriers.length }}</p>
                    <p class="mt-1 text-sm text-muted-foreground">Courriers enregistrés</p>
                </div>
                <div class="rounded-lg border border-amber-200/80 bg-card p-4 shadow-sm dark:border-amber-900/60">
                    <div class="flex items-center justify-between gap-3">
                        <p class="text-sm font-medium text-muted-foreground">Valeur déclarée</p>
                        <span class="rounded-md bg-amber-500/10 p-2 text-amber-600"><Package class="size-5" /></span>
                    </div>
                    <p class="mt-3 text-2xl font-semibold">{{ formatMontant(valeurDuJour) }}</p>
                    <p class="mt-1 text-sm text-muted-foreground">Base remboursement/perte</p>
                </div>
            </section>

            <section class="rounded-xl border bg-card p-4 shadow-sm">
                <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <h2 class="flex items-center gap-2 text-base font-semibold"><Send class="size-5" /> Envois du jour</h2>
                    <p class="text-lg font-semibold">Total : {{ formatMontant(totalDuJour) }}</p>
                </div>
                <Input v-model="recherche" placeholder="Rechercher : n° courrier, destination, client, téléphone..." class="mb-4 h-10 max-w-xl" />

                <p v-if="courriersAffiches.length === 0" class="py-6 text-sm text-muted-foreground">
                    Aucun courrier international enregistré pour cette date.
                </p>
                <div v-else class="overflow-x-auto">
                    <table class="w-full min-w-[760px] text-sm">
                        <thead>
                            <tr class="border-b text-left text-muted-foreground">
                                <th class="py-2 font-medium">Heure</th>
                                <th class="py-2 font-medium">N° courrier</th>
                                <th class="py-2 font-medium">Destination</th>
                                <th class="py-2 font-medium">Destinataire</th>
                                <th class="py-2 text-right font-medium">Valeur</th>
                                <th class="py-2 text-right font-medium">Frais</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr
                                v-for="c in courriersAffiches"
                                :key="c.uuid"
                                class="cursor-pointer border-b last:border-0 hover:bg-muted/40"
                                @click="ouvrirDetails(c)"
                            >
                                <td class="py-3">{{ c.heure }}</td>
                                <td class="py-3 font-semibold">{{ c.numero_courrier }}</td>
                                <td class="py-3">{{ c.destination }}</td>
                                <td class="py-3">
                                    <p class="font-medium">{{ c.destinataire }}</p>
                                    <p class="text-xs text-muted-foreground">{{ c.destinataire_telephone }}</p>
                                </td>
                                <td class="py-3 text-right">{{ formatMontant(c.valeur_colis) }}</td>
                                <td class="py-3 text-right font-semibold">{{ formatMontant(c.montant_total) }}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </section>
        </div>

        <Dialog v-model:open="dialogOuvert">
            <DialogContent class="flex h-[90vh] w-[92vw] max-w-5xl flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
                <DialogHeader class="shrink-0 border-b bg-background px-6 py-4">
                    <DialogTitle class="flex items-center gap-2"><Globe2 class="size-5" /> Nouvel envoi international</DialogTitle>
                </DialogHeader>
                <CourrierInternationalForm ref="form" @enregistre="onEnregistre" @fermer="dialogOuvert = false" />
            </DialogContent>
        </Dialog>

        <GestionLotsDialog
            v-model:open="lotsOuvert"
            type="courrier_international"
            :date="dateFiltre"
            :agence-id="session.agenceId"
            :user-id="session.userId"
        />

        <Dialog v-model:open="finDeCaisseOuvert">
            <DialogContent class="max-w-3xl">
                <DialogHeader>
                    <DialogTitle>Fin de caisse courrier international</DialogTitle>
                </DialogHeader>
                <div v-if="rapportFinDeCaisse" class="space-y-4">
                    <div class="rounded-lg border bg-muted/30 p-4">
                        <p class="text-sm text-muted-foreground">{{ salutationFinDeCaisse }}, {{ session.nom }}</p>
                        <p class="text-3xl font-bold">{{ formatMontant(totalAnime) }}</p>
                        <p class="text-sm text-muted-foreground">
                            {{ rapportFinDeCaisse.nombre_courriers }} courrier(s) · {{ rapportFinDeCaisse.nombre_colis }} colis
                        </p>
                    </div>
                    <div class="hidden print:block">
                        <FinDeCaisseSimpleRecu
                            titre="Fin de caisse - courrier international"
                            :agence="config.agence?.nom ?? 'Agence'"
                            :caissier="session.nom"
                            :date="dateFiltre"
                            libelle-compteur="Courriers"
                            :nombre="rapportFinDeCaisse.nombre_courriers"
                            :montant-total="rapportFinDeCaisse.montant_total"
                            :agents="rapportFinDeCaisse.agents"
                            :lignes="lignesRapportFinDeCaisse"
                            :details="detailsRapportFinDeCaisse"
                        />
                    </div>
                    <div class="rounded-lg border">
                        <div v-for="ligne in lignesRapportFinDeCaisse" :key="ligne.libelle" class="flex items-center justify-between gap-3 border-b px-4 py-3 last:border-0">
                            <div>
                                <p class="font-medium">{{ ligne.libelle }}</p>
                                <p class="text-xs text-muted-foreground">{{ ligne.nombre }} courrier(s) · {{ ligne.complement }}</p>
                            </div>
                            <p class="font-semibold">{{ formatMontant(ligne.montant_total) }}</p>
                        </div>
                    </div>
                    <p v-if="erreurImpression" class="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{{ erreurImpression }}</p>
                </div>
                <div v-else class="py-8 text-center text-sm text-muted-foreground">
                    Chargement du rapport...
                </div>
                <DialogFooter>
                    <Button variant="outline" @click="finDeCaisseOuvert = false">Fermer</Button>
                    <Button :disabled="!rapportFinDeCaisse || impressionEnCours" @click="imprimerFinDeCaisse">
                        <Spinner v-if="impressionEnCours" />
                        <Printer v-else />
                        Imprimer
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        <Dialog v-model:open="detailsOuvert">
            <DialogContent class="max-h-[92vh] w-[92vw] max-w-2xl overflow-y-auto sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle class="flex items-center gap-2"><Globe2 class="size-5" /> Courrier international {{ courrierDetails?.numero_courrier }}</DialogTitle>
                </DialogHeader>
                <div v-if="courrierDetails && recuReimpression" class="space-y-4">
                    <div class="rounded-xl border p-4">
                        <p class="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Destination</p>
                        <p class="text-base font-semibold">{{ courrierDetails.destination }}</p>
                        <p class="text-sm text-muted-foreground">N° {{ courrierDetails.numero_courrier }}</p>
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
                            <div v-for="(colis, i) in courrierDetails.colis" :key="i" class="flex items-center justify-between gap-3">
                                <span class="font-medium">
                                    {{ colis.quantite }} × {{ colis.nom }}
                                    <span class="font-normal text-muted-foreground">({{ typeLabel[colis.type] ?? colis.type }})</span>
                                </span>
                                <span class="shrink-0 font-medium">{{ formatMontant(colis.montant) }}</span>
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

                    <div class="zone-impression hidden print:block">
                        <CourrierRecu :recu="recuReimpression" :partie="partieReimpression" />
                    </div>
                </div>
                <p v-if="erreurReimpression" class="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{{ erreurReimpression }}</p>
                <DialogFooter class="gap-2">
                    <Button variant="outline" @click="detailsOuvert = false">Fermer</Button>
                    <Button @click="reimprimer('etiquette')">
                        <Printer />
                        Réimprimer étiquette (talon)
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    </AppSidebarLayout>
</template>
