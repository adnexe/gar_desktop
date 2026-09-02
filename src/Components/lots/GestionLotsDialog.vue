<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { Boxes, CheckCircle2, ClipboardList, FileText, ListChecks, MapPin, PackageCheck, PackageMinus, Plus, Printer, ScanBarcode, Tag, Truck } from '@lucide/vue';
import BordereauA4 from '@/Components/BordereauA4.vue';
import EtiquetteLot from '@/Components/lots/EtiquetteLot.vue';
import EtatLotsA4 from '@/Components/lots/EtatLotsA4.vue';
import FormatBordereauDialog from '@/Components/lots/FormatBordereauDialog.vue';
import { Badge } from '@/Components/ui/badge';
import { Button } from '@/Components/ui/button';
import { Checkbox } from '@/Components/ui/checkbox';
import { Input } from '@/Components/ui/input';
import {
    Dialog,
    DialogContent,
    DialogDescription,
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
import { Spinner } from '@/Components/ui/spinner';
import { useConfigStore } from '@/Stores/config';
import { dimensionsBordereauPos, imprimerBordereau, type FormatBordereau } from '@/lib/impressionA4';
import { hauteurZoneImpressionMm } from '@/lib/impression';
import { resoudreSelectionScanner } from '@/lib/selectionLotScanner';
import type { DetailsLot, ElementLotEligible, LotResume, StatutLot, TypeLot } from '@/types/lot';

const props = defineProps<{
    open: boolean;
    type: TypeLot;
    date: string;
    agenceId: number | null;
    userId: number | null;
}>();
const emit = defineEmits<{ 'update:open': [value: boolean] }>();

const config = useConfigStore();
const mode = ref<'liste' | 'nouveau'>('liste');
const lots = ref<LotResume[]>([]);
const eligibles = ref<ElementLotEligible[]>([]);
const groupeChoisi = ref('');
const selection = ref<string[]>([]);
const chargement = ref(false);
const creation = ref(false);
const bordereauEnCoursUuid = ref<string | null>(null);
const impressionEtat = ref(false);
const etiquetteEnCoursUuid = ref<string | null>(null);
const changementStatut = ref(false);
const retraitEnCours = ref(false);
const selectionRetrait = ref<string[]>([]);
const erreur = ref('');
const erreurDetails = ref('');
const detailsOuvert = ref(false);
const lotDetails = ref<DetailsLot | null>(null);
const lotImpression = ref<DetailsLot | null>(null);
const lotEtiquette = ref<DetailsLot | null>(null);
const lotsEtatImpression = ref<LotResume[] | null>(null);
const formatImpression = ref<FormatBordereau>('a4');
const choixFormatOuvert = ref(false);
const largeurPos = ref(80);
const demandeImpression = ref<{ lot: LotResume | DetailsLot } | { etat: true } | null>(null);
const codeScanne = ref('');
const scanEnCours = ref(false);
const champScanner = ref<{ $el?: HTMLInputElement } | null>(null);
const retourScan = ref<{ type: 'succes' | 'attention' | 'erreur'; message: string } | null>(null);
let derniereToucheScanner = 0;
let nombreTouchesRapides = 0;
let temporisateurScanner: ReturnType<typeof setTimeout> | null = null;

const titreModule = computed(() => props.type === 'courrier'
    ? 'livraison'
    : props.type === 'courrier_international' ? 'livraison internationale' : 'bagages');
const libelleGroupe = computed(() => props.type === 'courrier_international' ? 'Destination' : 'Destination et voyage');
const groupes = computed(() => {
    const uniques = new Map<string, { valeur: string; libelle: string; nombre: number }>();
    for (const element of eligibles.value) {
        const libelle = props.type === 'courrier_international'
            ? element.destination
            : `${element.destination}${element.voyage ? ` — ${element.voyage}` : ' — sans voyage'}`;
        const groupe = uniques.get(element.groupe);
        if (groupe) groupe.nombre++;
        else uniques.set(element.groupe, { valeur: element.groupe, libelle, nombre: 1 });
    }
    return [...uniques.values()];
});
const elementsDuGroupe = computed(() => eligibles.value.filter((element) => element.groupe === groupeChoisi.value));
const totalElementsDansLots = computed(() => lots.value.reduce((total, lot) => total + lot.nombre_elements, 0));
const toutSelectionne = computed(() => elementsDuGroupe.value.length > 0
    && elementsDuGroupe.value.every((element) => selection.value.includes(element.uuid)));
const totalSelection = computed(() => elementsDuGroupe.value
    .filter((element) => selection.value.includes(element.uuid))
    .reduce((somme, element) => somme + element.montant, 0));

const statutLibelle: Record<StatutLot, string> = {
    en_preparation: 'En préparation',
    expedie: 'Expédié',
    arrive: 'Arrivé',
    livre: 'Livré',
};
const statutSuivant: Record<StatutLot, StatutLot | null> = {
    en_preparation: 'expedie',
    expedie: 'arrive',
    arrive: 'livre',
    livre: null,
};
const actionStatut: Record<StatutLot, string> = {
    en_preparation: 'Marquer expédié',
    expedie: 'Marquer arrivé',
    arrive: 'Marquer livré',
    livre: 'Livré',
};

function formatMontant(montant: number): string {
    return `${new Intl.NumberFormat('fr-FR').format(montant)} FCFA`;
}

function libelleAcheminement(lot: LotResume): string {
    if (lot.voyage_libelle) return lot.voyage_libelle;
    return lot.type === 'courrier_international' ? 'Acheminement international' : 'Sans voyage';
}

function couleurStatut(statut: StatutLot): string {
    return {
        en_preparation: 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200',
        expedie: 'border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200',
        arrive: 'border-violet-300 bg-violet-50 text-violet-800 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-200',
        livre: 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200',
    }[statut];
}

async function charger() {
    if (!props.agenceId || !props.userId) return;
    chargement.value = true;
    erreur.value = '';
    try {
        const params = { agenceId: props.agenceId, type: props.type, date: props.date, userId: props.userId };
        const [reponseLots, reponseEligibles] = await Promise.all([
            window.api.lots.lister(params),
            window.api.lots.eligibles(params),
        ]);
        if (!reponseLots.ok) throw new Error(reponseLots.erreur);
        if (!reponseEligibles.ok) throw new Error(reponseEligibles.erreur);
        lots.value = (reponseLots.data ?? []) as LotResume[];
        eligibles.value = (reponseEligibles.data ?? []) as ElementLotEligible[];
        if (!groupes.value.some((groupe) => groupe.valeur === groupeChoisi.value)) {
            groupeChoisi.value = groupes.value[0]?.valeur ?? '';
        }
        selection.value = selection.value.filter((uuid) => eligibles.value.some((element) => element.uuid === uuid));
    } catch (e) {
        erreur.value = e instanceof Error && e.message ? e.message : 'Impossible de charger les lots.';
    } finally {
        chargement.value = false;
    }
}

function selectionner(uuid: string, actif: boolean) {
    selection.value = actif
        ? [...new Set([...selection.value, uuid])]
        : selection.value.filter((valeur) => valeur !== uuid);
}

function selectionnerTout() {
    if (toutSelectionne.value) {
        const groupe = new Set(elementsDuGroupe.value.map((element) => element.uuid));
        selection.value = selection.value.filter((uuid) => !groupe.has(uuid));
    } else {
        selection.value = [...new Set([...selection.value, ...elementsDuGroupe.value.map((element) => element.uuid)])];
    }
}

function focusScanner() {
    void nextTick(() => champScanner.value?.$el?.focus());
}

function annulerTemporisateurScanner() {
    if (temporisateurScanner) clearTimeout(temporisateurScanner);
    temporisateurScanner = null;
}

function suivreVitesseScanner(event: KeyboardEvent) {
    if (event.key.length !== 1) return;
    const maintenant = performance.now();
    nombreTouchesRapides = maintenant - derniereToucheScanner <= 70 ? nombreTouchesRapides + 1 : 1;
    derniereToucheScanner = maintenant;
    annulerTemporisateurScanner();

    // Certains lecteurs n'envoient pas Entrée. Une rafale rapide et suffisamment
    // longue est alors validée après un très court silence.
    if (nombreTouchesRapides >= 6) {
        temporisateurScanner = setTimeout(() => void traiterScan(), 140);
    }
}

async function traiterScan() {
    if (scanEnCours.value) return;
    annulerTemporisateurScanner();
    scanEnCours.value = true;

    try {
        const resultat = resoudreSelectionScanner(
            codeScanne.value,
            eligibles.value,
            selection.value,
            groupeChoisi.value,
        );

        if (resultat.statut === 'vide') return;
        codeScanne.value = '';

        if (resultat.statut === 'introuvable') {
            retourScan.value = {
                type: 'erreur',
                message: `${resultat.numero} est introuvable ou déjà affecté à un lot.`,
            };
            return;
        }
        if (resultat.statut === 'deja_selectionne') {
            retourScan.value = {
                type: 'attention',
                message: `${resultat.element.numero} est déjà sélectionné.`,
            };
            return;
        }
        if (resultat.statut === 'autre_groupe') {
            retourScan.value = {
                type: 'erreur',
                message: `${resultat.element.numero} appartient à une autre destination ou à un autre voyage.`,
            };
            return;
        }

        if (groupeChoisi.value !== resultat.element.groupe) {
            groupeChoisi.value = resultat.element.groupe;
            await nextTick();
        }
        selectionner(resultat.element.uuid, true);
        retourScan.value = {
            type: 'succes',
            message: `${resultat.element.numero} ajouté au lot.`,
        };
    } finally {
        scanEnCours.value = false;
        nombreTouchesRapides = 0;
        focusScanner();
    }
}

async function creerLot() {
    if (!props.agenceId || !props.userId || selection.value.length === 0) return;
    if (!window.confirm(`Créer ce lot avec ${selection.value.length} élément(s) ?`)) return;
    creation.value = true;
    erreur.value = '';
    try {
        const reponse = await window.api.lots.creer({
            agenceId: props.agenceId,
            type: props.type,
            date: props.date,
            userId: props.userId,
            // Une ref Vue expose un Proxy non sérialisable par Electron IPC.
            // La copie produit un tableau natif accepté par structured clone.
            elementUuids: [...selection.value],
        });
        if (!reponse.ok) throw new Error(reponse.erreur);
        selection.value = [];
        mode.value = 'liste';
        await charger();
        const lot = reponse.data as LotResume;
        await ouvrirDetails(lot);
    } catch (e) {
        erreur.value = e instanceof Error && e.message ? e.message : 'Impossible de créer le lot.';
    } finally {
        creation.value = false;
    }
}

async function obtenirDetails(lot: LotResume): Promise<DetailsLot | null> {
    if (!props.userId) return null;
    const reponse = await window.api.lots.details(lot.uuid, props.userId);
    if (!reponse.ok) throw new Error(reponse.erreur);
    return reponse.data as DetailsLot;
}

async function ouvrirDetails(lot: LotResume) {
    erreur.value = '';
    erreurDetails.value = '';
    selectionRetrait.value = [];
    try {
        lotDetails.value = await obtenirDetails(lot);
        detailsOuvert.value = lotDetails.value !== null;
    } catch (e) {
        erreur.value = e instanceof Error && e.message ? e.message : 'Impossible de charger le lot.';
    }
}

function selectionnerRetrait(uuid: string, actif: boolean) {
    selectionRetrait.value = actif
        ? [...new Set([...selectionRetrait.value, uuid])]
        : selectionRetrait.value.filter((valeur) => valeur !== uuid);
}

async function retirerElements() {
    if (!lotDetails.value || !props.userId || selectionRetrait.value.length === 0) return;
    if (selectionRetrait.value.length >= lotDetails.value.nombre_elements) {
        erreurDetails.value = 'Un lot doit conserver au moins un élément.';
        return;
    }
    const nombre = selectionRetrait.value.length;
    if (!window.confirm(`Retirer ${nombre} élément(s) du LOT N° ${lotDetails.value.numero_lot} ?`)) return;

    retraitEnCours.value = true;
    erreurDetails.value = '';
    try {
        const reponse = await window.api.lots.retirerElements({
            uuid: lotDetails.value.uuid,
            userId: props.userId,
            elementUuids: [...selectionRetrait.value],
        });
        if (!reponse.ok) throw new Error(reponse.erreur);
        lotDetails.value = reponse.data as DetailsLot;
        selectionRetrait.value = [];
        await charger();
    } catch (e) {
        erreurDetails.value = e instanceof Error && e.message ? e.message : 'Impossible de retirer les éléments du lot.';
    } finally {
        retraitEnCours.value = false;
    }
}

function choisirFormat(demande: NonNullable<typeof demandeImpression.value>) {
    if (bordereauEnCoursUuid.value || impressionEtat.value || etiquetteEnCoursUuid.value) return;
    largeurPos.value = dimensionsBordereauPos().papier;
    demandeImpression.value = demande;
    choixFormatOuvert.value = true;
}

function imprimer(lot: LotResume | DetailsLot) {
    choisirFormat({ lot });
}

function imprimerEtatLots() {
    if (lots.value.length) choisirFormat({ etat: true });
}

async function confirmerFormat() {
    const demande = demandeImpression.value;
    if (!demande) return;
    demandeImpression.value = null;
    choixFormatOuvert.value = false;
    await nextTick();
    if ('lot' in demande) await imprimerLotAvecFormat(demande.lot);
    else await imprimerEtatAvecFormat();
}

async function imprimerLotAvecFormat(lot: LotResume | DetailsLot) {
    if (bordereauEnCoursUuid.value || impressionEtat.value || etiquetteEnCoursUuid.value) return;
    bordereauEnCoursUuid.value = lot.uuid;
    erreur.value = '';
    try {
        await config.charger();
        lotsEtatImpression.value = null;
        lotImpression.value = 'courriers' in lot ? lot : await obtenirDetails(lot);
        if (!lotImpression.value) throw new Error('Ce lot est introuvable.');
        await nextTick();
        await imprimerBordereau(formatImpression.value);
    } catch (e) {
        erreur.value = e instanceof Error && e.message ? e.message : "L'impression du bordereau a échoué.";
    } finally {
        bordereauEnCoursUuid.value = null;
        lotImpression.value = null;
    }
}

async function imprimerEtatAvecFormat() {
    if (lots.value.length === 0 || bordereauEnCoursUuid.value || impressionEtat.value || etiquetteEnCoursUuid.value) return;
    impressionEtat.value = true;
    erreur.value = '';
    try {
        await config.charger();
        lotImpression.value = null;
        lotsEtatImpression.value = lots.value.map((lot) => ({ ...lot }));
        await nextTick();
        await imprimerBordereau(formatImpression.value);
    } catch (e) {
        erreur.value = e instanceof Error && e.message ? e.message : "L'impression de l'état des lots a échoué.";
    } finally {
        impressionEtat.value = false;
        lotsEtatImpression.value = null;
    }
}

async function imprimerEtiquette(lot: LotResume | DetailsLot) {
    if (bordereauEnCoursUuid.value || impressionEtat.value || etiquetteEnCoursUuid.value) return;
    etiquetteEnCoursUuid.value = lot.uuid;
    erreur.value = '';
    try {
        await config.charger();
        lotEtiquette.value = 'courriers' in lot ? lot : await obtenirDetails(lot);
        if (!lotEtiquette.value) throw new Error('Ce lot est introuvable.');
        await nextTick();
        const resultat = await window.api.impression.imprimerRecu(hauteurZoneImpressionMm());
        if (!resultat.ok) throw new Error(resultat.erreur || "L'étiquette n'a pas été imprimée.");
    } catch (e) {
        erreur.value = e instanceof Error && e.message ? e.message : "L'impression de l'étiquette a échoué.";
    } finally {
        lotEtiquette.value = null;
        etiquetteEnCoursUuid.value = null;
    }
}

async function avancerStatut(lot: LotResume | DetailsLot) {
    const suivant = statutSuivant[lot.statut];
    if (!suivant || !props.userId) return;
    if (!window.confirm(`Confirmer le statut « ${statutLibelle[suivant]} » pour le LOT N° ${lot.numero_lot} ?`)) return;
    changementStatut.value = true;
    erreur.value = '';
    try {
        const reponse = await window.api.lots.changerStatut(lot.uuid, suivant, props.userId);
        if (!reponse.ok) throw new Error(reponse.erreur);
        const actualise = reponse.data as LotResume;
        if (lotDetails.value?.uuid === actualise.uuid) lotDetails.value = { ...lotDetails.value, ...actualise };
        await charger();
    } catch (e) {
        erreur.value = e instanceof Error && e.message ? e.message : 'Impossible de modifier le statut.';
    } finally {
        changementStatut.value = false;
    }
}

watch(() => props.open, (ouvert) => {
    if (ouvert) void charger();
    else {
        choixFormatOuvert.value = false;
        annulerTemporisateurScanner();
    }
});
watch(choixFormatOuvert, (ouvert) => { if (!ouvert) demandeImpression.value = null; });
watch(() => props.date, () => {
    if (props.open) void charger();
});
watch(groupeChoisi, () => {
    selection.value = [];
    retourScan.value = null;
});
watch(mode, (valeur) => {
    codeScanne.value = '';
    retourScan.value = null;
    annulerTemporisateurScanner();
    if (valeur === 'nouveau') focusScanner();
});
onBeforeUnmount(annulerTemporisateurScanner);
</script>

<template>
    <Dialog :open="open" @update:open="emit('update:open', $event)">
        <DialogContent class="flex h-[90vh] w-[94vw] max-w-5xl flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
            <DialogHeader class="shrink-0 border-b px-6 py-4">
                <DialogTitle class="flex items-center gap-2">
                    <Boxes class="size-5" /> Lots et bordereaux de {{ titreModule }} — {{ date }}
                </DialogTitle>
                <DialogDescription class="sr-only">Créer, consulter, imprimer et suivre les lots de la date sélectionnée.</DialogDescription>
            </DialogHeader>

            <div class="flex shrink-0 flex-wrap items-center gap-1 border-b bg-muted/20 px-6 py-3">
                <Button size="sm" :variant="mode === 'liste' ? 'default' : 'ghost'" @click="mode = 'liste'">
                    <ClipboardList /> Lots enregistrés <Badge variant="secondary">{{ lots.length }}</Badge>
                </Button>
                <Button size="sm" :variant="mode === 'nouveau' ? 'default' : 'ghost'" @click="mode = 'nouveau'">
                    <Plus /> Nouveau lot
                </Button>
                <Button
                    v-if="mode === 'liste'"
                    size="sm"
                    variant="outline"
                    class="ml-auto"
                    :disabled="lots.length === 0 || !!bordereauEnCoursUuid || impressionEtat || !!etiquetteEnCoursUuid"
                    @click="imprimerEtatLots"
                >
                    <Spinner v-if="impressionEtat" /><ListChecks v-else />
                    {{ impressionEtat ? 'Impression…' : 'État des lots' }}
                </Button>
            </div>

            <div class="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                <p v-if="erreur" class="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{{ erreur }}</p>

                <div v-if="chargement" class="flex min-h-48 items-center justify-center gap-2 text-muted-foreground">
                    <Spinner /> Chargement des lots…
                </div>

                <template v-else-if="mode === 'liste'">
                    <p v-if="lots.length === 0" class="rounded-md border border-dashed px-4 py-10 text-center text-muted-foreground">
                        Aucun lot enregistré pour cette date.
                    </p>
                    <div v-else class="space-y-3">
                        <article v-for="lot in lots" :key="lot.uuid" class="rounded-lg border bg-card p-4 shadow-sm">
                            <div class="flex flex-wrap items-start justify-between gap-3">
                                <div class="min-w-0">
                                    <div class="flex flex-wrap items-center gap-2">
                                        <strong class="text-base">LOT N° {{ lot.numero_lot }}</strong>
                                        <span class="font-mono text-sm text-muted-foreground">{{ lot.reference }}</span>
                                        <Badge variant="outline" :class="couleurStatut(lot.statut)">{{ statutLibelle[lot.statut] }}</Badge>
                                    </div>
                                    <p class="mt-2 flex items-center gap-1 font-medium"><MapPin class="size-4" /> {{ lot.destination }}</p>
                                    <p class="mt-1 text-sm text-muted-foreground">
                                        {{ libelleAcheminement(lot) }} · créé par {{ lot.cree_par || '—' }}
                                    </p>
                                </div>
                                <div class="text-right">
                                    <p class="font-semibold">{{ formatMontant(lot.montant_total) }}</p>
                                    <p class="text-sm text-muted-foreground">{{ lot.nombre_elements }} élément(s)</p>
                                </div>
                            </div>
                            <div class="mt-4 flex flex-wrap justify-end gap-2 border-t pt-3">
                                <Button size="sm" variant="outline" @click="ouvrirDetails(lot)"><FileText /> Détails</Button>
                                <Button size="sm" variant="outline" :disabled="!!bordereauEnCoursUuid || impressionEtat || !!etiquetteEnCoursUuid" @click="imprimer(lot)">
                                    <Spinner v-if="bordereauEnCoursUuid === lot.uuid" /><Printer v-else /> Imprimer
                                </Button>
                                <Button size="sm" variant="outline" :disabled="!!bordereauEnCoursUuid || impressionEtat || !!etiquetteEnCoursUuid" @click="imprimerEtiquette(lot)">
                                    <Spinner v-if="etiquetteEnCoursUuid === lot.uuid" /><Tag v-else /> Étiquette
                                </Button>
                                <Button v-if="statutSuivant[lot.statut]" size="sm" :disabled="changementStatut" @click="avancerStatut(lot)">
                                    <Truck v-if="lot.statut === 'en_preparation'" />
                                    <PackageCheck v-else-if="lot.statut === 'expedie'" />
                                    <CheckCircle2 v-else />
                                    {{ actionStatut[lot.statut] }}
                                </Button>
                            </div>
                        </article>
                    </div>
                </template>

                <template v-else>
                    <div class="space-y-5">
                        <div class="rounded-lg border border-sky-200 bg-sky-50/60 p-4 dark:border-sky-900 dark:bg-sky-950/20">
                            <div class="mb-3 flex items-center gap-2">
                                <ScanBarcode class="size-5 text-sky-700 dark:text-sky-300" />
                                <label for="lot-code-barres" class="font-semibold">Lecture du code-barres</label>
                            </div>
                            <div class="flex flex-col gap-2 sm:flex-row">
                                <Input
                                    id="lot-code-barres"
                                    ref="champScanner"
                                    v-model="codeScanne"
                                    class="h-11 font-mono"
                                    autocomplete="off"
                                    placeholder="N° du talon"
                                    :disabled="chargement || creation"
                                    @keydown="suivreVitesseScanner"
                                    @keydown.enter.prevent="traiterScan"
                                />
                                <Button
                                    type="button"
                                    class="h-11 shrink-0"
                                    :disabled="!codeScanne.trim() || scanEnCours || chargement || creation"
                                    @click="traiterScan"
                                >
                                    <ScanBarcode /> Ajouter
                                </Button>
                            </div>
                            <p
                                v-if="retourScan"
                                role="status"
                                class="mt-3 flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium"
                                :class="{
                                    'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200': retourScan.type === 'succes',
                                    'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200': retourScan.type === 'attention',
                                    'border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200': retourScan.type === 'erreur',
                                }"
                            >
                                <CheckCircle2 v-if="retourScan.type === 'succes'" class="size-4 shrink-0" />
                                <ScanBarcode v-else class="size-4 shrink-0" />
                                {{ retourScan.message }}
                            </p>
                        </div>

                        <div>
                            <label class="mb-2 block text-sm font-medium">{{ libelleGroupe }}</label>
                            <Select v-model="groupeChoisi" :disabled="groupes.length === 0">
                                <SelectTrigger class="w-full"><SelectValue placeholder="Choisir une destination" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem v-for="groupe in groupes" :key="groupe.valeur" :value="groupe.valeur">
                                        {{ groupe.libelle }} · {{ groupe.nombre }} disponible(s)
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                            <div v-if="groupes.length === 0" class="mt-3 rounded-lg border border-dashed bg-muted/20 px-4 py-5 text-center">
                                <p class="font-medium">Aucun élément disponible pour un nouveau lot.</p>
                                <p v-if="totalElementsDansLots > 0" class="mt-1 text-sm text-muted-foreground">
                                    {{ totalElementsDansLots }} élément(s) de cette date sont déjà affectés aux lots enregistrés.
                                </p>
                                <p v-else class="mt-1 text-sm text-muted-foreground">
                                    Aucune opération n'est enregistrée pour cette date et cette agence.
                                </p>
                                <Button v-if="lots.length > 0" size="sm" variant="outline" class="mt-3" @click="mode = 'liste'">
                                    <ClipboardList /> Voir les lots enregistrés
                                </Button>
                            </div>
                        </div>

                        <div v-if="elementsDuGroupe.length" class="overflow-hidden rounded-lg border">
                            <div class="flex items-center justify-between gap-3 border-b bg-muted/30 px-4 py-3">
                                <label class="flex cursor-pointer items-center gap-2 text-sm font-medium">
                                    <Checkbox :model-value="toutSelectionne" @update:model-value="selectionnerTout" />
                                    Tout sélectionner
                                </label>
                                <span class="text-sm text-muted-foreground">{{ selection.length }} sélectionné(s) · {{ formatMontant(totalSelection) }}</span>
                            </div>
                            <div class="max-h-[42vh] divide-y overflow-y-auto">
                                <label v-for="element in elementsDuGroupe" :key="element.uuid" class="flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-muted/20">
                                    <Checkbox class="mt-1" :model-value="selection.includes(element.uuid)" @update:model-value="selectionner(element.uuid, !!$event)" />
                                    <div class="min-w-0 flex-1">
                                        <div class="flex flex-wrap items-center justify-between gap-2">
                                            <strong class="font-mono text-sm">{{ element.numero }}</strong>
                                            <span class="font-semibold">{{ formatMontant(element.montant) }}</span>
                                        </div>
                                        <p class="mt-1 font-medium">{{ element.principal }}<span v-if="element.telephone" class="font-normal text-muted-foreground"> · {{ element.telephone }}</span></p>
                                        <p class="mt-1 text-sm text-muted-foreground">{{ element.contenu || 'Contenu non renseigné' }}</p>
                                    </div>
                                </label>
                            </div>
                        </div>
                    </div>
                </template>
            </div>

            <DialogFooter class="shrink-0 border-t px-6 py-4">
                <Button variant="outline" @click="emit('update:open', false)">Fermer</Button>
                <Button v-if="mode === 'nouveau'" :disabled="selection.length === 0 || creation" @click="creerLot">
                    <Spinner v-if="creation" /><Plus v-else /> {{ creation ? 'Création…' : 'Créer le lot' }}
                </Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>

    <Dialog v-model:open="detailsOuvert">
        <DialogContent class="max-h-[90vh] w-[92vw] max-w-3xl overflow-y-auto sm:max-w-3xl">
            <DialogHeader>
                <DialogTitle>LOT N° {{ lotDetails?.numero_lot }} · {{ lotDetails?.reference }}</DialogTitle>
                <DialogDescription class="sr-only">Détails et suivi du lot sélectionné.</DialogDescription>
            </DialogHeader>
            <div v-if="lotDetails" class="space-y-4">
                <p v-if="erreurDetails" class="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{{ erreurDetails }}</p>
                <div class="grid grid-cols-1 gap-3 rounded-lg border p-4 sm:grid-cols-3">
                    <div><p class="text-xs text-muted-foreground uppercase">Destination</p><p class="font-semibold">{{ lotDetails.destination }}</p></div>
                    <div><p class="text-xs text-muted-foreground uppercase">Acheminement</p><p class="font-semibold">{{ libelleAcheminement(lotDetails) }}</p></div>
                    <div><p class="text-xs text-muted-foreground uppercase">Statut</p><Badge variant="outline" :class="couleurStatut(lotDetails.statut)">{{ statutLibelle[lotDetails.statut] }}</Badge></div>
                </div>
                <div class="overflow-x-auto rounded-lg border">
                    <table class="w-full text-sm">
                        <thead class="bg-muted/40"><tr><th v-if="lotDetails.statut === 'en_preparation'" class="w-10 px-3 py-2"><span class="sr-only">Sélection</span></th><th class="px-3 py-2 text-left">N°</th><th class="px-3 py-2 text-left">Client / destinataire</th><th class="px-3 py-2 text-left">Contenu</th><th class="px-3 py-2 text-right">Montant</th></tr></thead>
                        <tbody v-if="lotDetails.type !== 'bagage'">
                            <tr v-for="ligne in lotDetails.courriers" :key="ligne.uuid" class="border-t">
                                <td v-if="lotDetails.statut === 'en_preparation'" class="px-3 py-2"><Checkbox :model-value="selectionRetrait.includes(ligne.uuid)" @update:model-value="selectionnerRetrait(ligne.uuid, !!$event)" /></td><td class="px-3 py-2 font-mono">{{ ligne.numero_courrier }}</td><td class="px-3 py-2">{{ ligne.destinataire_nom }}</td><td class="px-3 py-2">{{ ligne.colis.map((c) => `${c.quantite} x ${c.nom}`).join(', ') }}</td><td class="px-3 py-2 text-right">{{ formatMontant(ligne.montant_total) }}</td>
                            </tr>
                        </tbody>
                        <tbody v-else>
                            <tr v-for="ligne in lotDetails.bagages" :key="ligne.uuid" class="border-t">
                                <td v-if="lotDetails.statut === 'en_preparation'" class="px-3 py-2"><Checkbox :model-value="selectionRetrait.includes(ligne.uuid)" @update:model-value="selectionnerRetrait(ligne.uuid, !!$event)" /></td><td class="px-3 py-2 font-mono">{{ ligne.numero_bagage }}</td><td class="px-3 py-2">{{ ligne.client || 'Client anonyme' }}</td><td class="px-3 py-2">{{ ligne.description || '—' }}</td><td class="px-3 py-2 text-right">{{ formatMontant(ligne.montant) }}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
            <DialogFooter>
                <Button
                    v-if="lotDetails?.statut === 'en_preparation'"
                    variant="destructive"
                    :disabled="selectionRetrait.length === 0 || selectionRetrait.length >= lotDetails.nombre_elements || retraitEnCours"
                    @click="retirerElements"
                >
                    <Spinner v-if="retraitEnCours" /><PackageMinus v-else />
                    {{ retraitEnCours ? 'Retrait…' : `Retirer du lot (${selectionRetrait.length})` }}
                </Button>
                <Button variant="outline" @click="detailsOuvert = false">Fermer</Button>
                <Button v-if="lotDetails" variant="outline" :disabled="!!bordereauEnCoursUuid || impressionEtat || !!etiquetteEnCoursUuid" @click="imprimer(lotDetails)">
                    <Spinner v-if="bordereauEnCoursUuid === lotDetails.uuid" /><Printer v-else /> Imprimer
                </Button>
                <Button v-if="lotDetails" variant="outline" :disabled="!!bordereauEnCoursUuid || impressionEtat || !!etiquetteEnCoursUuid" @click="imprimerEtiquette(lotDetails)">
                    <Spinner v-if="etiquetteEnCoursUuid === lotDetails.uuid" /><Tag v-else /> Étiquette
                </Button>
                <Button v-if="lotDetails && statutSuivant[lotDetails.statut]" :disabled="changementStatut" @click="avancerStatut(lotDetails)">{{ actionStatut[lotDetails.statut] }}</Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>

    <FormatBordereauDialog
        v-model:open="choixFormatOuvert"
        v-model:format="formatImpression"
        :largeur-pos="largeurPos"
        @confirmer="confirmerFormat"
    />

    <BordereauA4
        v-if="lotImpression"
        :format="formatImpression"
        :type="lotImpression.type"
        :date="lotImpression.date_operation"
        :agence="config.agence"
        :compagnie="config.compagnie"
        :courriers="lotImpression.courriers"
        :bagages="lotImpression.bagages"
        :numero-lot="lotImpression.numero_lot"
        :reference-lot="lotImpression.reference"
        :voyage="lotImpression.voyage_libelle"
    />

    <EtatLotsA4
        v-if="lotsEtatImpression"
        :format="formatImpression"
        :type="type"
        :date="date"
        :lots="lotsEtatImpression"
        :agence="config.agence"
        :compagnie="config.compagnie"
    />

    <div class="zone-impression hidden print:block">
        <EtiquetteLot
            v-if="lotEtiquette"
            :lot="lotEtiquette"
            :agence="config.agence"
            :compagnie="config.compagnie"
        />
    </div>
</template>
