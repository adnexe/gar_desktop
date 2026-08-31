<script setup lang="ts">
import { watchDebounced } from '@vueuse/core';
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue';
import { Check, Globe2, Package, Plus, Printer, Send, Trash2, UserRound, X } from '@lucide/vue';
import { Button } from '@/Components/ui/button';
import { Input } from '@/Components/ui/input';
import { Label } from '@/Components/ui/label';
import { Spinner } from '@/Components/ui/spinner';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/Components/ui/select';
import CourrierRecu from '@/Components/courrier/CourrierRecu.vue';
import { hauteurZoneImpressionMm } from '@/lib/impression';
import { useConfigStore, type CompagnieLocale } from '@/Stores/config';
import { useSessionStore } from '@/Stores/session';
import type { CourrierInternationalDuJour } from '@/types/courrier-international';

interface Pays { id: number; uuid: string; nom: string; code: string }
interface Ville { id: number; uuid: string; nom: string; pays_id: number | null }
interface LigneColis { nom: string; type: string; quantite: number; poidsKg: number | null; prix: number; frais?: number | null }
type ModeFacturation = 'par_kilo' | 'pourcentage';
type PersonneForm = { nom: string; prenoms: string; telephone: string };
type ClientRecherche = { nom: string | null; prenoms: string | null; cni?: string | null };
type ResultatImpression = { ok: boolean; erreur?: string };

const TYPES_COLIS = ['document', 'colis', 'objet_valeur', 'autre'];
const typeLabel: Record<string, string> = {
    document: 'Document',
    colis: 'Colis',
    carton: 'Carton',
    objet_valeur: 'Objet de valeur',
    autre: 'Autre',
};

const emit = defineEmits<{
    enregistre: [courrier: CourrierInternationalDuJour];
    fermer: [];
}>();

const config = useConfigStore();
const session = useSessionStore();

const pays = ref<Pays[]>([]);
const villes = ref<Ville[]>([]);
const paysDestinationId = ref<number | null>(null);
const villeDestinationId = ref<number | null>(null);
const villeLibre = ref('');
const adresseDestination = ref('');
const transporteur = ref('');
const trackingExterne = ref('');
const observation = ref('');

const expediteur = reactive<PersonneForm>({ nom: '', prenoms: '', telephone: '' });
const destinataire = reactive<PersonneForm>({ nom: '', prenoms: '', telephone: '' });

const modeFacturation = ref<ModeFacturation>('par_kilo');
const pourcentageFrais = ref(10);
const tarifKg = ref(0);
const nouveauColis = reactive<LigneColis>({ nom: '', type: TYPES_COLIS[0] ?? 'colis', quantite: 1, poidsKg: null, prix: 0 });
const colisListe = ref<LigneColis[]>([]);

const enregistrement = ref(false);
const confirmationOuverte = ref(false);
const erreur = ref('');
const partieImpression = ref<'tout' | 'recu' | 'etiquette'>('tout');
const recu = ref<{
    numero_courrier: string;
    destination: string;
    agence_arrivee: string | null;
    agence_arrivee_telephone: string | null;
    voyage: string | null;
    expediteur: string;
    expediteur_nom: string;
    expediteur_telephone: string;
    destinataire: string;
    destinataire_nom: string;
    destinataire_telephone: string;
    colis: { nom: string; type: string; quantite: number; montant: number }[];
    prix_expedition: number;
    montant_colis: number;
    montant_total: number;
    agence_depart: string | null;
    agence_depart_telephone: string | null;
    agent: string | null;
    created_at: string;
    compagnie: CompagnieLocale | null;
} | null>(null);

const paysSelectionne = computed(() => pays.value.find((p) => p.id === paysDestinationId.value) ?? null);
const villeSelectionnee = computed(() => villes.value.find((v) => v.id === villeDestinationId.value) ?? null);
const villeDestinationNom = computed(() => villeSelectionnee.value?.nom ?? villeLibre.value.trim());
const destinationLabel = computed(() => [villeDestinationNom.value, paysSelectionne.value?.nom].filter(Boolean).join(', '));
const valeurColis = computed(() => colisListe.value.reduce((s, c) => s + c.quantite * c.prix, 0));
const poidsTotal = computed(() => colisListe.value.reduce((s, c) => s + c.quantite * Number(c.poidsKg ?? 0), 0));
const fraisExpedition = computed(() => {
    if (modeFacturation.value === 'pourcentage') {
        return Math.round(valeurColis.value * (pourcentageFrais.value || 0) / 100);
    }
    return Math.round(poidsTotal.value * (tarifKg.value || 0));
});

const peutAjouterColis = computed(() =>
    nouveauColis.nom.trim().length > 0 &&
    nouveauColis.quantite >= 1 &&
    nouveauColis.prix >= 0 &&
    (modeFacturation.value === 'pourcentage' || Number(nouveauColis.poidsKg ?? 0) > 0),
);
const peutEnvoyer = computed(() =>
    !!config.agence &&
    !!paysSelectionne.value &&
    villeDestinationNom.value.length > 0 &&
    expediteur.nom.trim().length > 0 &&
    expediteur.telephone.trim().length > 0 &&
    destinataire.nom.trim().length > 0 &&
    destinataire.telephone.trim().length > 0 &&
    colisListe.value.length > 0 &&
    (modeFacturation.value === 'pourcentage' || (poidsTotal.value > 0 && tarifKg.value >= 0)) &&
    fraisExpedition.value >= 0 &&
    !enregistrement.value,
);

async function preRemplirClientDepuisTelephone(telephone: string, cible: PersonneForm) {
    const telephoneRecherche = telephone.trim();
    if (!telephoneRecherche || telephoneRecherche.length < 3) return;

    try {
        const donnees = (await window.api.vente.rechercherClient(telephoneRecherche)) as ClientRecherche | null;
        if (cible.telephone.trim() !== telephoneRecherche || !donnees) return;
        cible.nom = donnees.nom ?? cible.nom;
        cible.prenoms = donnees.prenoms ?? cible.prenoms;
    } catch (e) {
        erreur.value = messageErreurInconnue(e, 'Impossible de synchroniser le client.');
    }
}

watchDebounced(() => expediteur.telephone, (telephone) => {
    void preRemplirClientDepuisTelephone(telephone, expediteur);
}, { debounce: 300 });

watchDebounced(() => destinataire.telephone, (telephone) => {
    void preRemplirClientDepuisTelephone(telephone, destinataire);
}, { debounce: 300 });

watch(paysDestinationId, async (id) => {
    villeDestinationId.value = null;
    villeLibre.value = '';
    villes.value = id ? await window.api.referentiel.villesParPays(id) : [];
});

onMounted(async () => {
    pays.value = await window.api.referentiel.pays();
});

function ajouterColis() {
    if (!peutAjouterColis.value) return;

    colisListe.value.push({
        nom: nouveauColis.nom,
        type: nouveauColis.type,
        quantite: Number(nouveauColis.quantite),
        poidsKg: nouveauColis.poidsKg ? Number(nouveauColis.poidsKg) : null,
        prix: Number(nouveauColis.prix),
    });
    nouveauColis.nom = '';
    nouveauColis.type = TYPES_COLIS[0] ?? 'colis';
    nouveauColis.quantite = 1;
    nouveauColis.poidsKg = null;
    nouveauColis.prix = 0;
}

function retirerColis(index: number) {
    colisListe.value.splice(index, 1);
}

function montantFraisLigne(ligne: LigneColis) {
    if (modeFacturation.value === 'par_kilo') return ligne.quantite * Number(ligne.poidsKg ?? 0) * Number(tarifKg.value || 0);
    return Math.round(ligne.quantite * ligne.prix * (pourcentageFrais.value || 0) / 100);
}

function nomComplet(personne: { nom: string; prenoms: string }) {
    return [personne.prenoms, personne.nom].filter(Boolean).join(' ').trim();
}

function resetSaisie(garderRecu = true) {
    paysDestinationId.value = null;
    villeDestinationId.value = null;
    villeLibre.value = '';
    villes.value = [];
    adresseDestination.value = '';
    transporteur.value = '';
    trackingExterne.value = '';
    observation.value = '';
    expediteur.nom = '';
    expediteur.prenoms = '';
    expediteur.telephone = '';
    destinataire.nom = '';
    destinataire.prenoms = '';
    destinataire.telephone = '';
    modeFacturation.value = 'par_kilo';
    pourcentageFrais.value = 10;
    tarifKg.value = 0;
    nouveauColis.nom = '';
    nouveauColis.type = TYPES_COLIS[0] ?? 'colis';
    nouveauColis.quantite = 1;
    nouveauColis.poidsKg = null;
    nouveauColis.prix = 0;
    colisListe.value = [];
    confirmationOuverte.value = false;
    erreur.value = '';
    if (!garderRecu) recu.value = null;
}

function resetTout() {
    resetSaisie(false);
}

defineExpose({ resetTout });

function messageErreurInconnue(e: unknown, defaut: string) {
    if (!(e instanceof Error)) return defaut;

    return e.message
        .replace(/^Error invoking remote method '[^']+': Error: /, '')
        .replace(/^Error invoking remote method "[^"]+": Error: /, '');
}

async function imprimer(partie: 'recu' | 'etiquette'): Promise<ResultatImpression> {
    partieImpression.value = partie;
    try {
        await nextTick();
        return await window.api.impression.imprimerRecu(hauteurZoneImpressionMm());
    } finally {
        partieImpression.value = 'tout';
    }
}

async function reimprimerEtiquette() {
    if (!recu.value) return;
    erreur.value = '';
    try {
        const impression = await imprimer('etiquette');
        if (!impression.ok) {
            erreur.value = `Étiquette non imprimée : ${impression.erreur ?? 'Impression non confirmée par le système.'}`;
        }
    } catch (e) {
        erreur.value = `Étiquette non imprimée : ${messageErreurInconnue(e, "L'impression n'a pas pu être lancée.")}`;
    }
}

async function envoyer() {
    if (!config.agence || !session.userId || !paysSelectionne.value || !villeDestinationNom.value) {
        erreur.value = 'Choisissez le pays et la ville de destination.';
        return;
    }

    enregistrement.value = true;
    erreur.value = '';
    const agenceActuelle = config.agence;
    const paysActuel = paysSelectionne.value;
    const villeIdActuelle = villeSelectionnee.value?.id ?? null;
    const villeNomActuelle = villeDestinationNom.value;
    const userId = session.userId;

    try {
        const reponse = (await window.api.courrierInternational.enregistrer({
            agenceId: agenceActuelle.id,
            paysDestinationId: paysActuel.id,
            villeDestinationId: villeIdActuelle,
            paysDestination: paysActuel.nom,
            villeDestination: villeNomActuelle,
            adresseDestination: adresseDestination.value || null,
            transporteur: transporteur.value || null,
            trackingExterne: trackingExterne.value || null,
            userId,
            agentId: session.agentId,
            modeFacturation: modeFacturation.value,
            pourcentageFrais: modeFacturation.value === 'pourcentage' ? pourcentageFrais.value : null,
            fraisExpedition: fraisExpedition.value,
            valeurColis: valeurColis.value,
            observation: observation.value || null,
            expediteur: { nom: expediteur.nom, prenoms: expediteur.prenoms || null, telephone: expediteur.telephone },
            destinataire: { nom: destinataire.nom, prenoms: destinataire.prenoms || null, telephone: destinataire.telephone },
            colis: colisListe.value.map((c) => ({
                nom: c.nom,
                type: c.type,
                quantite: c.quantite,
                poidsKg: c.poidsKg,
                prix: c.prix,
                frais: modeFacturation.value === 'par_kilo' ? tarifKg.value : null,
            })),
        })) as {
            ok: boolean;
            courrier?: { uuid: string; numeroCourrier: string; valeurColis: number; montantTotal: number; created_at: string };
            erreur?: string;
        };

        if (!reponse.ok || !reponse.courrier) {
            erreur.value = reponse.erreur ?? "L'enregistrement n'a pas abouti. Réessaie, rien n'a été perdu.";
            confirmationOuverte.value = false;
            return;
        }

        confirmationOuverte.value = false;
        const dernierRecu = {
            numero_courrier: reponse.courrier.numeroCourrier,
            destination: [villeNomActuelle, paysActuel.nom].join(', '),
            agence_arrivee: null,
            agence_arrivee_telephone: null,
            voyage: transporteur.value ? `Transporteur : ${transporteur.value}` : null,
            expediteur: `${nomComplet(expediteur)} (${expediteur.telephone})`.trim(),
            expediteur_nom: nomComplet(expediteur),
            expediteur_telephone: expediteur.telephone,
            destinataire: `${nomComplet(destinataire)} (${destinataire.telephone})`.trim(),
            destinataire_nom: nomComplet(destinataire),
            destinataire_telephone: destinataire.telephone,
            colis: colisListe.value.map((c) => ({
                nom: c.nom,
                type: typeLabel[c.type] ?? c.type,
                quantite: c.quantite,
                montant: c.quantite * c.prix,
            })),
            prix_expedition: fraisExpedition.value,
            montant_colis: reponse.courrier.valeurColis,
            montant_total: reponse.courrier.montantTotal,
            agence_depart: agenceActuelle.nom,
            agence_depart_telephone: agenceActuelle.telephone,
            agent: session.nom || null,
            created_at: reponse.courrier.created_at,
            compagnie: config.compagnie,
        };
        recu.value = dernierRecu;

        let impression: ResultatImpression;
        try {
            impression = await imprimer('recu');
        } catch (e) {
            impression = { ok: false, erreur: messageErreurInconnue(e, "L'impression n'a pas pu être lancée.") };
        }

        if (!impression.ok) {
            const motif = impression.erreur ?? 'Impression non confirmée par le système.';
            recu.value = null;
            try {
                await window.api.courrierInternational.annulerImpression(reponse.courrier.uuid, motif);
                erreur.value = `Courrier international ${reponse.courrier.numeroCourrier} annulé : ${motif}. La vente n'est pas comptabilisée.`;
            } catch (e) {
                erreur.value = `Impression non confirmée pour le courrier ${reponse.courrier.numeroCourrier}, mais l'annulation automatique a échoué : ${messageErreurInconnue(e, motif)}. Vérifiez avant de continuer.`;
            }
            return;
        }

        try {
            const etiquette = await imprimer('etiquette');
            if (!etiquette.ok) {
                erreur.value = `Le reçu est imprimé, mais l'étiquette colis n'est pas sortie : ${etiquette.erreur ?? 'erreur inconnue'}.`;
            }
        } catch (e) {
            erreur.value = `Le reçu est imprimé, mais l'étiquette colis n'est pas sortie : ${messageErreurInconnue(e, 'erreur inconnue')}.`;
        }

        const confirmation = await window.api.courrierInternational.confirmerImpression(reponse.courrier.uuid);
        if (!confirmation.ok) {
            erreur.value = confirmation.erreur
                ?? `Le reçu courrier ${reponse.courrier.numeroCourrier} a peut-être été imprimé, mais la validation locale a échoué. Vérifiez avant de continuer.`;
            return;
        }

        emit('enregistre', {
            uuid: reponse.courrier.uuid,
            numero_courrier: reponse.courrier.numeroCourrier,
            heure: reponse.courrier.created_at.split(' ')[1],
            destination: dernierRecu.destination,
            pays_destination: paysActuel.nom,
            ville_destination: villeNomActuelle,
            destinataire: dernierRecu.destinataire_nom,
            destinataire_telephone: destinataire.telephone,
            expediteur: dernierRecu.expediteur_nom,
            expediteur_telephone: expediteur.telephone,
            montant_total: reponse.courrier.montantTotal,
            valeur_colis: reponse.courrier.valeurColis,
        });

        resetSaisie(true);
    } catch (e) {
        erreur.value = messageErreurInconnue(e, "L'enregistrement n'a pas abouti. Réessaie, rien n'a été perdu.");
        confirmationOuverte.value = false;
    } finally {
        enregistrement.value = false;
    }
}

const formatMontant = (montant: number) => new Intl.NumberFormat('fr-FR').format(montant) + ' FCFA';
</script>

<template>
    <div class="relative flex min-h-0 flex-1 flex-col">
        <div class="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-6">
            <p v-if="erreur" class="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {{ erreur }}
            </p>

            <div class="rounded-xl border p-5">
                <p class="mb-3 flex items-center gap-2 text-base font-semibold">
                    <Globe2 class="size-5 text-sky-600" /> Destination internationale
                </p>
                <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <div class="space-y-1.5">
                        <Label>Pays</Label>
                        <Select v-model="paysDestinationId">
                            <SelectTrigger class="h-10 w-full"><SelectValue placeholder="Choisir un pays" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem v-for="p in pays" :key="p.id" :value="p.id">{{ p.nom }}</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div v-if="villes.length" class="space-y-1.5">
                        <Label>Ville destination</Label>
                        <Select v-model="villeDestinationId" :disabled="!paysDestinationId || villes.length === 0">
                            <SelectTrigger class="h-10 w-full"><SelectValue placeholder="Choisir une ville" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem v-for="ville in villes" :key="ville.id" :value="ville.id">{{ ville.nom }}</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div v-else class="space-y-1.5">
                        <Label for="ville_libre">Ville destination</Label>
                        <Input id="ville_libre" v-model="villeLibre" :disabled="!paysDestinationId" placeholder="Ex : Paris" class="h-10 text-base" />
                        <p v-if="paysDestinationId" class="text-xs text-muted-foreground">Aucune ville configurée pour ce pays.</p>
                    </div>
                    <div class="space-y-1.5">
                        <Label for="transporteur_inter">Transporteur <span class="text-muted-foreground">(facultatif)</span></Label>
                        <Input id="transporteur_inter" v-model="transporteur" placeholder="Ex : DHL, partenaire local" class="h-10 text-base" />
                    </div>
                    <div class="space-y-1.5 lg:col-span-2">
                        <Label for="adresse">Adresse destination <span class="text-muted-foreground">(facultatif)</span></Label>
                        <Input id="adresse" v-model="adresseDestination" placeholder="Adresse complète du destinataire" class="h-10 text-base" />
                    </div>
                    <div class="space-y-1.5">
                        <Label for="tracking_inter">Tracking externe <span class="text-muted-foreground">(facultatif)</span></Label>
                        <Input id="tracking_inter" v-model="trackingExterne" placeholder="Référence transporteur" class="h-10 text-base" />
                    </div>
                </div>
            </div>

            <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div class="rounded-xl border-2 p-5">
                    <p class="mb-3 flex items-center gap-2 text-base font-semibold">
                        <UserRound class="size-5 text-emerald-600" /> Expéditeur
                    </p>
                    <div class="grid grid-cols-2 gap-3">
                        <div class="col-span-2 space-y-1.5">
                            <Label for="exp_telephone_inter">Téléphone</Label>
                            <Input id="exp_telephone_inter" v-model="expediteur.telephone" class="h-10 text-base" />
                        </div>
                        <div class="space-y-1.5">
                            <Label for="exp_nom_inter">Nom</Label>
                            <Input id="exp_nom_inter" v-model="expediteur.nom" class="h-10 text-base" />
                        </div>
                        <div class="space-y-1.5">
                            <Label for="exp_prenoms_inter">Prénoms</Label>
                            <Input id="exp_prenoms_inter" v-model="expediteur.prenoms" class="h-10 text-base" />
                        </div>
                    </div>
                </div>

                <div class="rounded-xl border-2 p-5">
                    <p class="mb-3 flex items-center gap-2 text-base font-semibold">
                        <UserRound class="size-5 text-violet-600" /> Destinataire
                    </p>
                    <div class="grid grid-cols-2 gap-3">
                        <div class="col-span-2 space-y-1.5">
                            <Label for="dest_telephone_inter">Téléphone</Label>
                            <Input id="dest_telephone_inter" v-model="destinataire.telephone" class="h-10 text-base" />
                        </div>
                        <div class="space-y-1.5">
                            <Label for="dest_nom_inter">Nom</Label>
                            <Input id="dest_nom_inter" v-model="destinataire.nom" class="h-10 text-base" />
                        </div>
                        <div class="space-y-1.5">
                            <Label for="dest_prenoms_inter">Prénoms</Label>
                            <Input id="dest_prenoms_inter" v-model="destinataire.prenoms" class="h-10 text-base" />
                        </div>
                    </div>
                </div>
            </div>

            <div class="rounded-xl border p-5">
                <div class="mb-4 flex items-center justify-between gap-3">
                    <p class="flex items-center gap-2 text-base font-semibold"><Package class="size-5 text-amber-600" /> Colis</p>
                    <span class="text-sm font-medium text-muted-foreground">Valeur : {{ formatMontant(valeurColis) }}</span>
                </div>

                <div class="flex flex-wrap items-end gap-2">
                    <div class="grid min-w-52 flex-1 gap-1.5">
                        <Label for="colis_nom_inter">Description</Label>
                        <Input id="colis_nom_inter" v-model="nouveauColis.nom" placeholder="Documents, colis..." class="h-10" />
                    </div>
                    <div class="grid w-40 gap-1.5">
                        <Label>Type</Label>
                        <Select v-model="nouveauColis.type">
                            <SelectTrigger class="h-10 w-full"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem v-for="type in TYPES_COLIS" :key="type" :value="type">
                                    {{ typeLabel[type] ?? type }}
                                </SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div class="grid w-24 gap-1.5">
                        <Label for="colis_quantite_inter">Qté</Label>
                        <Input id="colis_quantite_inter" v-model.number="nouveauColis.quantite" type="number" min="1" class="h-10" />
                    </div>
                    <div class="grid w-32 gap-1.5">
                        <Label for="colis_poids_inter">Poids kg <span v-if="modeFacturation === 'pourcentage'" class="text-muted-foreground">(fac.)</span></Label>
                        <Input id="colis_poids_inter" v-model.number="nouveauColis.poidsKg" type="number" min="0" step="0.01" class="h-10" />
                    </div>
                    <div class="grid w-40 gap-1.5">
                        <Label for="colis_prix_inter">Valeur déclarée</Label>
                        <Input id="colis_prix_inter" v-model.number="nouveauColis.prix" type="number" min="0" step="50" class="h-10" />
                    </div>
                    <div class="flex items-end">
                        <Button type="button" variant="outline" :disabled="!peutAjouterColis" @click="ajouterColis">
                            <Plus />
                            Ajouter
                        </Button>
                    </div>
                </div>

                <p v-if="colisListe.length === 0" class="mt-4 text-sm text-muted-foreground">
                    Aucun colis ajouté pour l'instant.
                </p>

                <table v-else class="mt-4 w-full text-sm">
                    <thead>
                        <tr class="border-b text-left text-muted-foreground">
                            <th class="py-2 font-medium">Colis</th>
                            <th class="py-2 font-medium">Type</th>
                            <th class="py-2 font-medium">Qté</th>
                            <th class="py-2 text-right font-medium">Poids</th>
                            <th class="py-2 text-right font-medium">Valeur</th>
                            <th class="py-2 text-right font-medium">Frais estimés</th>
                            <th class="py-2"></th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="(ligne, index) in colisListe" :key="index" class="border-b last:border-0">
                            <td class="py-2 font-medium">{{ ligne.nom }}</td>
                            <td class="py-2">{{ typeLabel[ligne.type] ?? ligne.type }}</td>
                            <td class="py-2">{{ ligne.quantite }}</td>
                            <td class="py-2 text-right">{{ ligne.poidsKg ? `${ligne.poidsKg} kg` : '-' }}</td>
                            <td class="py-2 text-right">{{ formatMontant(ligne.quantite * ligne.prix) }}</td>
                            <td class="py-2 text-right font-medium">{{ formatMontant(montantFraisLigne(ligne)) }}</td>
                            <td class="py-2 text-right">
                                <Button type="button" size="icon" variant="ghost" @click="retirerColis(index)">
                                    <Trash2 class="size-4 text-destructive" />
                                </Button>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <div class="grid grid-cols-1 gap-4 lg:grid-cols-[16rem_14rem_minmax(18rem,1fr)] lg:items-start">
                <div class="min-w-0 space-y-1.5">
                    <Label class="flex h-5 items-center">Mode de facturation</Label>
                    <Select v-model="modeFacturation">
                        <SelectTrigger class="h-10 w-full">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="par_kilo">Par kilo</SelectItem>
                            <SelectItem value="pourcentage">Pourcentage sur valeur</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div v-if="modeFacturation === 'pourcentage'" class="min-w-0 space-y-1.5">
                    <Label for="pourcentage_inter" class="flex h-5 items-center">Pourcentage appliqué</Label>
                    <Input id="pourcentage_inter" v-model.number="pourcentageFrais" type="number" min="0" max="100" step="0.01" class="h-10 text-base" />
                </div>
                <div v-else class="min-w-0 space-y-1.5">
                    <Label for="tarif_kg" class="flex h-5 items-center">Tarif par kg</Label>
                    <Input id="tarif_kg" v-model.number="tarifKg" type="number" min="0" placeholder="Ex : 2500" class="h-10 text-base" />
                </div>
                <div class="rounded-lg border bg-muted/30 px-4 py-3 text-right text-sm lg:justify-self-end">
                    <p class="text-muted-foreground">Valeur déclarée : {{ formatMontant(valeurColis) }}</p>
                    <p class="text-muted-foreground">Poids total : {{ poidsTotal.toLocaleString('fr-FR') }} kg</p>
                    <p class="mt-1 border-t pt-1 text-xl font-semibold">Total à payer : {{ formatMontant(fraisExpedition) }}</p>
                    <p class="mt-1 text-xs text-muted-foreground">
                        <span v-if="modeFacturation === 'pourcentage'">{{ pourcentageFrais || 0 }}% de la valeur des colis</span>
                        <span v-else>{{ poidsTotal.toLocaleString('fr-FR') }} kg × {{ formatMontant(tarifKg || 0) }}</span>
                    </p>
                </div>
            </div>

            <div v-if="recu" class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
                <div>
                    <p class="text-sm font-semibold">Dernier courrier international : {{ recu.numero_courrier }}</p>
                    <p class="text-sm text-muted-foreground">{{ recu.destination }} · {{ recu.destinataire_nom }}</p>
                </div>
                <Button variant="outline" @click="reimprimerEtiquette">
                    <Printer />
                    Réimprimer étiquette (talon)
                </Button>
            </div>
        </div>

        <div class="shrink-0 flex items-center justify-end gap-2 border-t bg-background px-6 py-3">
            <Button variant="outline" @click="emit('fermer')">Fermer</Button>
            <Button :disabled="!peutEnvoyer" @click="confirmationOuverte = true">
                <Spinner v-if="enregistrement" />
                <Send v-else />
                {{ enregistrement ? 'Impression…' : 'Enregistrer et imprimer' }}
            </Button>
        </div>

        <div v-if="confirmationOuverte" class="absolute inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div class="w-full max-w-lg rounded-xl border bg-background p-5 shadow-xl">
                <h3 class="flex items-center gap-2 text-lg font-semibold">
                    <Send class="size-5" />
                    Confirmer l'envoi
                </h3>
                <p class="mt-1 text-sm text-muted-foreground">Vérifiez les informations avant d'enregistrer et imprimer le reçu.</p>

                <div class="mt-4 space-y-3 text-sm">
                    <div class="rounded-lg border px-4 py-3">
                        <p class="text-xs font-medium text-muted-foreground">Destination</p>
                        <p class="font-semibold">{{ destinationLabel || 'Pays non renseigné' }}</p>
                        <p v-if="transporteur" class="mt-1 text-muted-foreground">Transporteur : {{ transporteur }}</p>
                    </div>

                    <div class="grid gap-3 sm:grid-cols-2">
                        <div class="rounded-lg border px-4 py-3">
                            <p class="text-xs font-medium text-muted-foreground">Expéditeur</p>
                            <p class="font-medium">{{ expediteur.prenoms }} {{ expediteur.nom }}</p>
                            <p class="text-muted-foreground">{{ expediteur.telephone }}</p>
                        </div>
                        <div class="rounded-lg border px-4 py-3">
                            <p class="text-xs font-medium text-muted-foreground">Destinataire</p>
                            <p class="font-medium">{{ destinataire.prenoms }} {{ destinataire.nom }}</p>
                            <p class="text-muted-foreground">{{ destinataire.telephone }}</p>
                        </div>
                    </div>

                    <div class="grid gap-3 sm:grid-cols-3">
                        <div class="rounded-lg border px-4 py-3">
                            <p class="text-xs font-medium text-muted-foreground">Colis</p>
                            <p class="font-semibold">{{ colisListe.length }} ligne(s)</p>
                        </div>
                        <div class="rounded-lg border px-4 py-3">
                            <p class="text-xs font-medium text-muted-foreground">Valeur</p>
                            <p class="font-semibold">{{ formatMontant(valeurColis) }}</p>
                        </div>
                        <div class="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300">
                            <p class="text-xs font-medium opacity-80">Total à payer</p>
                            <p class="font-semibold">{{ formatMontant(fraisExpedition) }}</p>
                        </div>
                    </div>
                </div>

                <div class="mt-4 flex items-center justify-end gap-2">
                    <Button variant="outline" @click="confirmationOuverte = false">
                        <X />
                        Fermer
                    </Button>
                    <Button :disabled="enregistrement" @click="envoyer">
                        <Spinner v-if="enregistrement" />
                        <Check v-else />
                        {{ enregistrement ? 'Enregistrement...' : 'Confirmer et imprimer' }}
                    </Button>
                </div>
            </div>
        </div>
    </div>

    <div class="zone-impression hidden print:block">
        <CourrierRecu v-if="recu" :recu="recu" :partie="partieImpression" />
    </div>
</template>
