<script setup lang="ts">
import { watchDebounced } from '@vueuse/core';
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { Check, Mail, Package, Plus, Printer, Send, Trash2, UserRound, X } from '@lucide/vue';
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
import { useConfigStore, type CompagnieLocale } from '@/Stores/config';
import { hauteurZoneImpressionMm } from '@/lib/impression';
import { construireLienSuiviPublic } from '@/lib/suiviPublic';
import { useSessionStore } from '@/Stores/session';
import type { CourrierDuJour } from '@/types/courrier';

interface Ville { id: number; uuid: string; nom: string }
interface Agence { id: number; uuid: string; nom: string; ville_id: number; telephone: string | null }
interface VoyageOption { id: number; uuid: string; date_depart: string; heure_depart: string; itineraire_nom: string | null }
interface LigneColis { nom: string; type: string; quantite: number; prix: number }

const TYPES_COLIS = ['petit', 'gros', 'objet_valeur', 'autre'];
const typeLabel: Record<string, string> = {
    petit: 'Petit',
    gros: 'Gros',
    objet_valeur: 'Objet de valeur',
    autre: 'Autre',
};

const emit = defineEmits<{
    enregistre: [courrier: CourrierDuJour];
    fermer: [];
}>();

const config = useConfigStore();
const session = useSessionStore();

const villes = ref<Ville[]>([]);
// On ne peut pas envoyer un courrier vers la ville où l'on se trouve déjà.
const villesDestinationsPossibles = computed(() => villes.value.filter((v) => v.id !== config.agence?.ville_id));
const villeArriveeId = ref<number | null>(null);
const agencesDestination = ref<Agence[]>([]);
const agenceArriveeId = ref<number | null>(null);

const voyagesAgence = ref<VoyageOption[]>([]);
const voyageId = ref<number | null>(null);

const expediteur = reactive({ nom: '', prenoms: '', telephone: '' });
const destinataire = reactive({ nom: '', prenoms: '', telephone: '' });
type PersonneForm = { nom: string; prenoms: string; telephone: string };
type ClientRecherche = { nom: string | null; prenoms: string | null; cni?: string | null };

// Saisie d'un colis puis « Ajouter » vers la liste (même logique que le web).
const nouveauColis = reactive<LigneColis>({ nom: '', type: 'petit', quantite: 1, prix: 0 });
const colisListe = ref<LigneColis[]>([]);

const peutAjouterColis = computed(() => nouveauColis.nom.trim().length > 0 && nouveauColis.prix >= 0 && nouveauColis.quantite >= 1);

// Les frais d'expédition sont proposés à un pourcentage (10 % par défaut,
// modifiable) de la valeur des colis. Le montant reste lui aussi modifiable.
const pourcentageExpedition = ref<number>(10);
const prixExpedition = ref<number | null>(null);
const expeditionManuelle = ref(false);

const enregistrement = ref(false);
const erreur = ref('');
const recu = ref<{
    uuid: string;
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
    suivi_url: string | null;
    compagnie: CompagnieLocale | null;
} | null>(null);
let intervalleVoyages: ReturnType<typeof setInterval> | null = null;

const montantColis = computed(() => colisListe.value.reduce((s, c) => s + c.quantite * c.prix, 0));

// Le client ne paie QUE les frais d'expédition (la valeur des colis est
// une valeur déclarée, affichée à part mais jamais encaissée).
const montantTotal = computed(() => prixExpedition.value ?? 0);

function fraisSelonPourcentage() {
    return Math.round(montantColis.value * (pourcentageExpedition.value || 0) / 100);
}

// Tant que le montant n'a pas été saisi à la main, on le garde synchronisé
// sur « pourcentage % de la valeur des colis ». La saisie clavier fige la valeur.
watch([montantColis, pourcentageExpedition], () => {
    if (!expeditionManuelle.value) {
        prixExpedition.value = fraisSelonPourcentage();
    }
});

async function preRemplirClientDepuisTelephone(telephone: string, cible: PersonneForm) {
    const telephoneRecherche = telephone.trim();
    if (!telephoneRecherche || telephoneRecherche.length < 3) return;

    try {
        const donnees = (await window.api.vente.rechercherClient(telephoneRecherche)) as ClientRecherche | null;
        if (cible.telephone.trim() !== telephoneRecherche || !donnees) return;

        cible.nom = donnees.nom ?? cible.nom;
        cible.prenoms = donnees.prenoms ?? cible.prenoms;
    } catch (e) {
        erreur.value = messageErreurInconnue(e, 'Impossible de synchroniser le client avec la caisse serveur.');
    }
}

watchDebounced(() => expediteur.telephone, (telephone) => {
    void preRemplirClientDepuisTelephone(telephone, expediteur);
}, { debounce: 300 });

watchDebounced(() => destinataire.telephone, (telephone) => {
    void preRemplirClientDepuisTelephone(telephone, destinataire);
}, { debounce: 300 });

function recalculerExpedition() {
    prixExpedition.value = fraisSelonPourcentage();
    expeditionManuelle.value = false;
}

const confirmationOuverte = ref(false);
const villeArriveeNom = computed(() => villes.value.find((v) => v.id === villeArriveeId.value)?.nom ?? '');
const agenceArriveeNom = computed(() => agencesDestination.value.find((a) => a.id === agenceArriveeId.value)?.nom ?? '');
const voyageSelectionne = computed(() => voyagesAgence.value.find((v) => v.id === voyageId.value) ?? null);
const nbColis = computed(() => colisListe.value.reduce((s, c) => s + c.quantite, 0));

const peutEnvoyer = computed(() =>
    !!config.agence &&
    !!villeArriveeId.value &&
    expediteur.nom.trim().length > 0 &&
    expediteur.telephone.trim().length > 0 &&
    destinataire.nom.trim().length > 0 &&
    destinataire.telephone.trim().length > 0 &&
    colisListe.value.length > 0 &&
    prixExpedition.value !== null &&
    !enregistrement.value,
);

async function chargerVoyagesAgence() {
    if (!config.agence) {
        voyagesAgence.value = [];
        return;
    }

    try {
        await window.api.config.actualiserVoyagesServeurLocal(config.agence.id);
        voyagesAgence.value = await window.api.referentiel.voyagesDeAgence(config.agence.id);
    } catch {
        // En mode client, une coupure LAN ne doit pas vider la liste déjà chargée.
    }
}

onMounted(async () => {
    villes.value = await window.api.referentiel.villes();
    await chargerVoyagesAgence();
    intervalleVoyages = setInterval(() => {
        void chargerVoyagesAgence();
    }, 15000);
});

onUnmounted(() => {
    if (intervalleVoyages) {
        clearInterval(intervalleVoyages);
    }
});

// Une ville peut contenir plusieurs agences (ex : Abidjan → Yopougon, Adjamé...).
watch(villeArriveeId, async (id) => {
    agenceArriveeId.value = null;
    agencesDestination.value = [];
    if (!id) return;

    agencesDestination.value = await window.api.referentiel.agencesParVille(id);
    if (agencesDestination.value.length === 1) {
        agenceArriveeId.value = agencesDestination.value[0].id;
    }
});

function ajouterColis() {
    if (!peutAjouterColis.value) return;

    colisListe.value.push({ ...nouveauColis });
    nouveauColis.nom = '';
    nouveauColis.type = 'petit';
    nouveauColis.quantite = 1;
    nouveauColis.prix = 0;
}
function retirerColis(index: number) {
    colisListe.value.splice(index, 1);
}

function libelleVoyage(v: VoyageOption) {
    return `${v.date_depart} ${v.heure_depart} · ${v.itineraire_nom ?? ''}`;
}

function nomComplet(personne: { nom: string; prenoms: string }) {
    return [personne.prenoms, personne.nom].filter(Boolean).join(' ').trim();
}

// Après un envoi réussi, on garde le dernier reçu en mémoire : le bloc
// « Dernier courrier » permet de réimprimer reçu ou étiquette.
function resetSaisie() {
    villeArriveeId.value = null;
    agenceArriveeId.value = null;
    agencesDestination.value = [];
    voyageId.value = null;
    expediteur.nom = '';
    expediteur.prenoms = '';
    expediteur.telephone = '';
    destinataire.nom = '';
    destinataire.prenoms = '';
    destinataire.telephone = '';
    nouveauColis.nom = '';
    nouveauColis.type = 'petit';
    nouveauColis.quantite = 1;
    nouveauColis.prix = 0;
    colisListe.value = [];
    prixExpedition.value = null;
    pourcentageExpedition.value = 10;
    expeditionManuelle.value = false;
    confirmationOuverte.value = false;
    erreur.value = '';
}

function resetTout() {
    villeArriveeId.value = null;
    agenceArriveeId.value = null;
    agencesDestination.value = [];
    voyageId.value = null;
    expediteur.nom = '';
    expediteur.prenoms = '';
    expediteur.telephone = '';
    destinataire.nom = '';
    destinataire.prenoms = '';
    destinataire.telephone = '';
    nouveauColis.nom = '';
    nouveauColis.type = 'petit';
    nouveauColis.quantite = 1;
    nouveauColis.prix = 0;
    colisListe.value = [];
    prixExpedition.value = null;
    pourcentageExpedition.value = 10;
    expeditionManuelle.value = false;
    confirmationOuverte.value = false;
    erreur.value = '';
    recu.value = null;
    void chargerVoyagesAgence();
}

defineExpose({ resetTout });

type ResultatImpression = { ok: boolean; erreur?: string };

function messageErreurInconnue(e: unknown, defaut: string) {
    if (!(e instanceof Error)) return defaut;

    return e.message
        .replace(/^Error invoking remote method '[^']+': Error: /, '')
        .replace(/^Error invoking remote method "[^"]+": Error: /, '');
}

// Reçu et étiquette colis partent en deux jobs séparés : l'imprimante coupe
// entre les deux, l'étiquette n'est plus collée au reçu du client.
const partieImpression = ref<'tout' | 'recu' | 'etiquette'>('tout');

async function imprimer(partie: 'recu' | 'etiquette'): Promise<ResultatImpression> {
    partieImpression.value = partie;
    try {
        await nextTick();
        return await window.api.impression.imprimerRecu(hauteurZoneImpressionMm());
    } finally {
        partieImpression.value = 'tout';
    }
}

async function reimprimer(partie: 'recu' | 'etiquette') {
    if (!recu.value) return;

    erreur.value = '';
    try {
        const impression = await imprimer(partie);
        if (!impression.ok) {
            erreur.value = `${partie === 'recu' ? 'Reçu' : 'Étiquette'} non imprimé(e) : ${impression.erreur ?? 'Impression non confirmée par le système.'}`;
        }
    } catch (e) {
        erreur.value = `${partie === 'recu' ? 'Reçu' : 'Étiquette'} non imprimé(e) : ${messageErreurInconnue(e, "L'impression n'a pas pu être lancée.")}`;
    }
}

async function envoyer() {
    if (!config.agence || !villeArriveeId.value || !session.userId) {
        erreur.value = 'Choisissez la ville de destination.';
        return;
    }

    enregistrement.value = true;
    erreur.value = '';
    const agenceActuelle = config.agence;
    const villeArriveeIdActuelle = villeArriveeId.value;
    const agenceArriveeIdActuelle = agenceArriveeId.value;
    const userId = session.userId;
    const prixExpeditionActuel = prixExpedition.value ?? 0;

    try {
        const reponse = (await window.api.courrier.enregistrer({
            agenceId: agenceActuelle.id,
            villeArriveeId: villeArriveeIdActuelle,
            agenceArriveeId: agenceArriveeIdActuelle,
            voyageId: voyageId.value,
            voyageUuid: voyageSelectionne.value?.uuid ?? null,
            userId,
            agentId: session.agentId,
            prixExpedition: prixExpeditionActuel,
            expediteur: { nom: expediteur.nom, prenoms: expediteur.prenoms || null, telephone: expediteur.telephone },
            destinataire: { nom: destinataire.nom, prenoms: destinataire.prenoms || null, telephone: destinataire.telephone },
            // Objets simples (non réactifs) : un proxy Vue casse la sérialisation
            // structured-clone d'Electron (« An object could not be cloned »).
            colis: colisListe.value.map((c) => ({ nom: c.nom, type: c.type, quantite: c.quantite, prix: c.prix })),
        })) as {
            ok: boolean;
            courrier?: { uuid: string; numeroCourrier: string; montantColis: number; montantTotal: number; created_at: string };
            erreur?: string;
        };

        if (!reponse.ok || !reponse.courrier) {
            erreur.value = reponse.erreur ?? "L'enregistrement n'a pas abouti. Réessaie, rien n'a été perdu.";
            confirmationOuverte.value = false;
            return;
        }

        confirmationOuverte.value = false;

        const destination = villes.value.find((v) => v.id === villeArriveeIdActuelle)?.nom ?? '';
        const agenceDestination = agencesDestination.value.find((a) => a.id === agenceArriveeIdActuelle) ?? null;
        const voyageLabel = voyageSelectionne.value ? libelleVoyage(voyageSelectionne.value) : null;

        const dernierRecu = {
            uuid: reponse.courrier.uuid,
            numero_courrier: reponse.courrier.numeroCourrier,
            destination,
            agence_arrivee: agenceDestination?.nom ?? null,
            agence_arrivee_telephone: agenceDestination?.telephone ?? null,
            voyage: voyageLabel,
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
            prix_expedition: prixExpeditionActuel,
            montant_colis: reponse.courrier.montantColis,
            montant_total: reponse.courrier.montantTotal,
            agence_depart: agenceActuelle.nom,
            agence_depart_telephone: agenceActuelle.telephone,
            agent: session.nom || null,
            created_at: reponse.courrier.created_at,
            suivi_url: construireLienSuiviPublic(config.adminUrl, 'courrier', reponse.courrier.numeroCourrier, reponse.courrier.uuid),
            compagnie: config.compagnie,
        };
        recu.value = dernierRecu;

        let impression: ResultatImpression;
        try {
            impression = await imprimer('recu');
        } catch (e) {
            impression = {
                ok: false,
                erreur: messageErreurInconnue(e, "L'impression n'a pas pu être lancée."),
            };
        }

        if (!impression.ok) {
            const motif = impression.erreur ?? 'Impression non confirmée par le système.';
            recu.value = null;

            try {
                await window.api.courrier.annulerImpression(reponse.courrier.uuid, motif);
                erreur.value = `Courrier ${reponse.courrier.numeroCourrier} annulé : ${motif}. La vente n'est pas comptabilisée.`;
            } catch (e) {
                erreur.value = `Impression non confirmée pour le courrier ${reponse.courrier.numeroCourrier}, mais l'annulation automatique a échoué : ${messageErreurInconnue(e, motif)}. Vérifiez avant de continuer.`;
            }

            return;
        }

        // Le reçu client est sorti : l'étiquette colis part en second job.
        // Son échec n'annule pas l'envoi, on avertit simplement.
        try {
            const etiquette = await imprimer('etiquette');
            if (!etiquette.ok) {
                erreur.value = `Le reçu est imprimé, mais l'étiquette colis n'est pas sortie : ${etiquette.erreur ?? 'erreur inconnue'}.`;
            }
        } catch (e) {
            erreur.value = `Le reçu est imprimé, mais l'étiquette colis n'est pas sortie : ${messageErreurInconnue(e, 'erreur inconnue')}.`;
        }

        const confirmation = await window.api.courrier.confirmerImpression(reponse.courrier.uuid);
        if (!confirmation.ok) {
            erreur.value = confirmation.erreur
                ?? `Le reçu courrier ${reponse.courrier.numeroCourrier} a peut-être été imprimé, mais la validation locale a échoué. Vérifiez avant de continuer.`;
            return;
        }

        emit('enregistre', {
            uuid: reponse.courrier.uuid,
            numero_courrier: reponse.courrier.numeroCourrier,
            heure: reponse.courrier.created_at.split(' ')[1],
            destination,
            destinataire: dernierRecu.destinataire_nom,
            destinataire_telephone: dernierRecu.destinataire_telephone,
            expediteur: dernierRecu.expediteur_nom,
            expediteur_telephone: dernierRecu.expediteur_telephone,
            montant_total: reponse.courrier.montantTotal,
            montant_colis: reponse.courrier.montantColis,
        });

        resetSaisie();
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

            <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div class="space-y-1.5">
                    <Label>Destination</Label>
                    <Select v-model="villeArriveeId">
                        <SelectTrigger class="h-10 w-full"><SelectValue placeholder="Choisir une ville" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem v-for="ville in villesDestinationsPossibles" :key="ville.id" :value="ville.id">{{ ville.nom }}</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div class="space-y-1.5">
                    <Label>Agence de destination <span class="text-muted-foreground">(facultatif)</span></Label>
                    <Select v-model="agenceArriveeId" :disabled="!villeArriveeId">
                        <SelectTrigger class="h-10 w-full"><SelectValue placeholder="Aucune agence précise" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem :value="null">Aucune agence précise</SelectItem>
                            <SelectItem v-for="a in agencesDestination" :key="a.id" :value="a.id">{{ a.nom }}</SelectItem>
                        </SelectContent>
                    </Select>
                    <p v-if="villeArriveeId && agencesDestination.length === 0" class="text-xs text-muted-foreground">
                        Aucune agence dans cette ville — le colis sera retirable dans n'importe laquelle.
                    </p>
                </div>
                <div class="space-y-1.5">
                    <Label>Voyage de départ <span class="text-muted-foreground">(facultatif)</span></Label>
                    <Select v-model="voyageId">
                        <SelectTrigger class="h-10 w-full"><SelectValue placeholder="Aucun voyage précis" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem v-for="v in voyagesAgence" :key="v.id" :value="v.id">{{ libelleVoyage(v) }}</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div class="rounded-xl border-2 p-5">
                    <p class="mb-3 flex items-center gap-2 text-base font-semibold">
                        <UserRound class="size-5" /> Expéditeur
                    </p>
                    <div class="grid grid-cols-2 gap-3">
                        <div class="col-span-2 space-y-1.5">
                            <Label for="exp_telephone">Téléphone</Label>
                            <Input id="exp_telephone" v-model="expediteur.telephone" class="h-10 text-base" />
                        </div>
                        <div class="space-y-1.5">
                            <Label for="exp_nom">Nom</Label>
                            <Input id="exp_nom" v-model="expediteur.nom" class="h-10 text-base" />
                        </div>
                        <div class="space-y-1.5">
                            <Label for="exp_prenoms">Prénoms</Label>
                            <Input id="exp_prenoms" v-model="expediteur.prenoms" class="h-10 text-base" />
                        </div>
                    </div>
                </div>

                <div class="rounded-xl border-2 p-5">
                    <p class="mb-3 flex items-center gap-2 text-base font-semibold">
                        <Mail class="size-5" /> Destinataire
                    </p>
                    <div class="grid grid-cols-2 gap-3">
                        <div class="col-span-2 space-y-1.5">
                            <Label for="dest_telephone">Téléphone</Label>
                            <Input id="dest_telephone" v-model="destinataire.telephone" class="h-10 text-base" />
                        </div>
                        <div class="space-y-1.5">
                            <Label for="dest_nom">Nom</Label>
                            <Input id="dest_nom" v-model="destinataire.nom" class="h-10 text-base" />
                        </div>
                        <div class="space-y-1.5">
                            <Label for="dest_prenoms">Prénoms</Label>
                            <Input id="dest_prenoms" v-model="destinataire.prenoms" class="h-10 text-base" />
                        </div>
                    </div>
                </div>
            </div>

            <div class="rounded-xl border p-5">
                <p class="mb-3 flex items-center gap-2 text-base font-semibold"><Package class="size-5" /> Colis</p>

                <div class="flex flex-wrap items-end gap-2">
                    <div class="grid min-w-40 flex-1 gap-1.5">
                        <Label for="colis_nom">Nom du colis</Label>
                        <Input id="colis_nom" v-model="nouveauColis.nom" placeholder="Ex : Carton de vêtements" class="h-9" />
                    </div>
                    <div class="grid w-40 gap-1.5">
                        <Label>Type</Label>
                        <Select v-model="nouveauColis.type">
                            <SelectTrigger class="h-9 w-full"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem v-for="type in TYPES_COLIS" :key="type" :value="type">
                                    {{ typeLabel[type] ?? type }}
                                </SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div class="grid w-24 gap-1.5">
                        <Label for="colis_quantite">Qté</Label>
                        <Input id="colis_quantite" v-model.number="nouveauColis.quantite" type="number" min="1" class="h-9" />
                    </div>
                    <div class="grid w-32 gap-1.5">
                        <Label for="colis_prix">Prix unitaire</Label>
                        <Input id="colis_prix" v-model.number="nouveauColis.prix" type="number" min="0" step="50" class="h-9" />
                    </div>
                    <Button type="button" :disabled="!peutAjouterColis" @click="ajouterColis">
                        <Plus />
                        Ajouter
                    </Button>
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
                            <th class="py-2 text-right font-medium">Prix unitaire</th>
                            <th class="py-2 text-right font-medium">Montant</th>
                            <th class="py-2"></th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="(ligne, index) in colisListe" :key="index" class="border-b last:border-0">
                            <td class="py-2">{{ ligne.nom }}</td>
                            <td class="py-2">{{ typeLabel[ligne.type] ?? ligne.type }}</td>
                            <td class="py-2">{{ ligne.quantite }}</td>
                            <td class="py-2 text-right">{{ formatMontant(ligne.prix) }}</td>
                            <td class="py-2 text-right font-medium">
                                {{ formatMontant(ligne.quantite * ligne.prix) }}
                            </td>
                            <td class="py-2 text-right">
                                <Button variant="ghost" size="icon" @click="retirerColis(index)">
                                    <Trash2 class="text-destructive" />
                                </Button>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <div class="grid grid-cols-1 gap-4 lg:grid-cols-[12rem_18rem_minmax(18rem,1fr)] lg:items-start">
                <div class="min-w-0 space-y-1.5">
                    <Label for="pourcentage" class="flex h-5 items-center">Pourcentage (%)</Label>
                    <Input
                        id="pourcentage"
                        v-model.number="pourcentageExpedition"
                        type="number"
                        min="0"
                        step="1"
                        class="h-10 text-base"
                        @input="expeditionManuelle = false"
                    />
                </div>
                <div class="min-w-0 space-y-1.5">
                    <div class="flex h-5 items-center justify-between">
                        <Label for="prix_expedition">Frais d'expédition (FCFA)</Label>
                        <button type="button" class="text-xs font-medium text-primary hover:underline" @click="recalculerExpedition">
                            Recalculer
                        </button>
                    </div>
                    <Input
                        id="prix_expedition"
                        v-model.number="prixExpedition"
                        type="number"
                        min="0"
                        step="50"
                        class="h-10 text-base"
                        @input="expeditionManuelle = true"
                    />
                    <p class="text-xs text-muted-foreground">= {{ pourcentageExpedition }} % de la valeur des colis — modifiable.</p>
                </div>
                <div class="rounded-lg border bg-muted/30 px-4 py-3 text-right text-sm lg:justify-self-end">
                    <p class="text-muted-foreground">Valeur des colis : {{ formatMontant(montantColis) }}</p>
                    <p class="text-muted-foreground">Frais d'expédition : {{ formatMontant(prixExpedition ?? 0) }}</p>
                    <p class="mt-1 border-t pt-1 text-xl font-semibold">Total à payer : {{ formatMontant(montantTotal) }}</p>
                </div>
            </div>

            <div v-if="recu" class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
                <div>
                    <p class="text-sm font-semibold">Dernier courrier enregistré : {{ recu.numero_courrier }}</p>
                    <p class="text-sm text-muted-foreground">{{ recu.destination }} · {{ recu.destinataire_nom }}</p>
                </div>
                <Button variant="outline" @click="reimprimer('etiquette')">
                    <Printer />
                    Réimprimer étiquette (talon)
                </Button>
            </div>
        </div>

        <!-- Barre d'actions fixe : hors de la zone qui défile. -->
        <div class="shrink-0 flex items-center justify-end gap-2 border-t bg-background px-6 py-3">
            <Button variant="outline" @click="emit('fermer')">Fermer</Button>
            <Button :disabled="!peutEnvoyer" @click="confirmationOuverte = true">
                <Send />
                {{ enregistrement ? 'Enregistrement…' : 'Enregistrer et imprimer' }}
            </Button>
        </div>

        <!-- Confirmation en surimpression : reste dans le formulaire (pas de
             modale imbriquée) pour un comportement identique web / desktop. -->
        <div v-if="confirmationOuverte" class="absolute inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div class="w-full max-w-md rounded-xl border bg-background p-5 shadow-xl">
                <h3 class="text-lg font-semibold">Confirmer l'envoi du courrier ?</h3>
                <p class="mt-1 text-sm text-muted-foreground">Vérifiez les informations avant d'imprimer le reçu.</p>

                <div class="mt-3 space-y-1.5 rounded-lg border bg-muted/30 p-3 text-sm">
                    <div class="flex justify-between">
                        <span class="text-muted-foreground">Destination</span>
                        <span class="font-medium">{{ villeArriveeNom }}<span v-if="agenceArriveeNom"> — {{ agenceArriveeNom }}</span></span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-muted-foreground">Expéditeur</span>
                        <span class="font-medium">{{ [expediteur.prenoms, expediteur.nom].filter(Boolean).join(' ') }}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-muted-foreground">Destinataire</span>
                        <span class="font-medium">{{ [destinataire.prenoms, destinataire.nom].filter(Boolean).join(' ') }}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-muted-foreground">Colis</span>
                        <span class="font-medium">{{ nbColis }} — valeur {{ formatMontant(montantColis) }}</span>
                    </div>
                    <div class="flex justify-between border-t pt-1.5">
                        <span class="font-medium">Frais d'expédition (encaissé)</span>
                        <span class="text-lg font-bold">{{ formatMontant(montantTotal) }}</span>
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
                        {{ enregistrement ? 'Enregistrement…' : 'Confirmer' }}
                    </Button>
                </div>
            </div>
        </div>
    </div>

    <div class="zone-impression hidden print:block">
        <CourrierRecu v-if="recu" :recu="recu" :partie="partieImpression" />
    </div>
</template>
