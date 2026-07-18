<script setup lang="ts">
import { watchDebounced } from '@vueuse/core';
import { Armchair, Banknote, Check, LoaderCircle, MapPin, RotateCcw, Ticket, User, X } from '@lucide/vue';
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue';
import SeatMap from '@/Components/vente/SeatMap.vue';
import TicketRecu, { type Recu } from '@/Components/vente/TicketRecu.vue';
import { Badge } from '@/Components/ui/badge';
import { Button } from '@/Components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/Components/ui/dialog';
import { Input } from '@/Components/ui/input';
import { Label } from '@/Components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/Components/ui/select';
import { hauteurZoneImpressionMm } from '@/lib/impression';
import { useSessionStore } from '@/Stores/session';
import type { VenteDuJour } from '@/types/vente';

type VilleOption = { id: number; nom: string };

type VoyageDisponible = {
    id: number;
    uuid: string;
    date_depart: string;
    heure_depart: string;
    numero_depart: number;
    itineraire: string | null;
    vehicule_immatriculation: string;
    nombre_places: number;
    chauffeur: string | null;
    places_occupees: number[];
    premiere_place_libre: number | null;
};

const props = defineProps<{
    agenceId: number | null;
    villeDepartId: number | null;
    villes: VilleOption[];
}>();

const emit = defineEmits<{
    vendu: [vente: VenteDuJour];
    fermer: [];
}>();

const session = useSessionStore();

const villeArriveeId = ref<number | null>(null);
const rechercheVille = ref('');

type GrilleTarif = {
    ordinaire: { aller: number | null; aller_retour: number | null };
    vip: { aller: number | null; aller_retour: number | null };
};

const chargementVoyages = ref(false);
const messageAucunVoyage = ref<string | null>(null);
const trajetActuel = ref<{ id: number; nom: string | null } | null>(null);
const tarifActuel = ref<GrilleTarif | null>(null);
const voyagesDisponibles = ref<VoyageDisponible[]>([]);

const voyageSelectionne = ref<VoyageDisponible | null>(null);
const typeBillet = ref<'aller' | 'aller_retour'>('aller');
const tarification = ref<'ordinaire' | 'vip'>('ordinaire');
const timbre = ref<number>(0);
const placeSelectionnee = ref<number | null>(null);
const confirmationOuverte = ref(false);
// Passe à true après la première vente : le formulaire n'est pas réinitialisé
// (pour pouvoir réimprimer ou revendre), le bouton devient « Vendre à nouveau ».
const venteEffectuee = ref(false);

const client = reactive({
    nom: '',
    prenoms: '',
    telephone: '',
    cni: '',
});

type ClientRecherche = {
    telephone?: string | null;
    nom: string | null;
    prenoms: string | null;
    cni: string | null;
};

const clientRempliAuto = ref<{ telephone: string; nom: string; prenoms: string; cni: string } | null>(null);
let sequenceRechercheClient = 0;

const enVente = ref(false);
const erreur = ref<string | null>(null);
const recus = ref<Recu[]>([]);

type CachePdfTicket = {
    empreinte: string;
    numero: string;
    createdAtIso: string;
    ticketId: string;
    talonId: string;
    creeLe: number;
};

const cachePdfTicket = ref<CachePdfTicket | null>(null);
const preparationPdfEnCours = ref<Promise<void> | null>(null);
let sequencePreparationPdf = 0;
let minuteriePreparationPdf: ReturnType<typeof setTimeout> | null = null;
const DUREE_VALIDITE_PDF_PREPARE_MS = 45_000;
const DELAI_PREPARATION_APRES_VOYAGE_MS = 900;
const DELAI_PREPARATION_APRES_MODIFICATION_MS = 1_400;
const PAUSE_AVANT_TALON_MS = 100;
type SourcePreparationPdf = 'selection_voyage' | 'selection_place' | 'modification_formulaire' | 'confirmation';

const villesAffichables = computed(() => {
    const terme = rechercheVille.value.trim().toLowerCase();

    return props.villes
        .filter((v) => v.id !== props.villeDepartId)
        .filter((v) => !terme || v.nom.toLowerCase().includes(terme));
});

// Grille active selon la tarification choisie (ordinaire par défaut).
const grilleActive = computed(() => tarifActuel.value?.[tarification.value] ?? null);

const vipDisponible = computed(() => (tarifActuel.value?.vip.aller ?? 0) > 0);
const allerRetourDisponible = computed(() => (grilleActive.value?.aller_retour ?? 0) > 0);

const prixAffiche = computed(() => {
    if (!grilleActive.value) return 0;

    return (typeBillet.value === 'aller' ? grilleActive.value.aller : grilleActive.value.aller_retour) ?? 0;
});

// Si la grille choisie ne propose pas l'option, on retombe sur un choix valide.
watch([tarification, tarifActuel], () => {
    if (tarification.value === 'vip' && !vipDisponible.value) {
        tarification.value = 'ordinaire';
    }

    if (typeBillet.value === 'aller_retour' && !allerRetourDisponible.value) {
        typeBillet.value = 'aller';
    }
});

const totalAPayer = computed(() => prixAffiche.value + (timbre.value || 0));

const peutVendre = computed(() =>
    !!props.agenceId &&
    !!voyageSelectionne.value &&
    !!trajetActuel.value &&
    !!placeSelectionnee.value &&
    !enVente.value,
);

async function chargerVoyages() {
    voyageSelectionne.value = null;
    placeSelectionnee.value = null;
    voyagesDisponibles.value = [];
    trajetActuel.value = null;
    tarifActuel.value = null;
    typeBillet.value = 'aller';
    tarification.value = 'ordinaire';
    messageAucunVoyage.value = null;
    // Changer de destination invalide le dernier ticket imprimable.
    recus.value = [];
    venteEffectuee.value = false;

    if (!props.agenceId || !props.villeDepartId || !villeArriveeId.value) return;

    chargementVoyages.value = true;

    try {
        const data = (await window.api.vente.rechercherVoyages({
            agenceId: props.agenceId,
            villeDepartId: props.villeDepartId,
            villeArriveeId: villeArriveeId.value,
        })) as { trajet: { id: number; nom: string | null } | null; tarif: GrilleTarif | null; voyages: VoyageDisponible[]; message: string | null };

        const voyagesNonPasses = data.voyages.filter(voyageNonPasse);

        trajetActuel.value = data.trajet;
        tarifActuel.value = data.tarif;
        voyagesDisponibles.value = voyagesNonPasses;

        if (voyagesNonPasses.length === 0) {
            messageAucunVoyage.value = data.message ?? "Aucun voyage programmé à partir d'aujourd'hui pour cette destination.";
        }
    } catch (e) {
        erreur.value = messageErreurInconnue(e, 'Impossible de récupérer les voyages de la caisse serveur.');
        messageAucunVoyage.value = 'Connexion à la caisse serveur indisponible.';
    } finally {
        chargementVoyages.value = false;
    }
}

function selectionnerVille(id: number) {
    villeArriveeId.value = id;
    chargerVoyages();
}

// Évite de recréer un client à chaque vente : si le téléphone correspond
// à une fiche existante, ses informations sont proposées automatiquement.
function retirerAncienClientAuto(telephone: string) {
    const ancien = clientRempliAuto.value;
    if (!ancien || ancien.telephone === telephone) return;

    if (client.nom === ancien.nom) client.nom = '';
    if (client.prenoms === ancien.prenoms) client.prenoms = '';
    if (client.cni === ancien.cni) client.cni = '';
    clientRempliAuto.value = null;
}

function appliquerClientTrouve(donnees: ClientRecherche, telephone: string) {
    client.nom = donnees.nom ?? '';
    client.prenoms = donnees.prenoms ?? '';
    client.cni = donnees.cni ?? '';
    clientRempliAuto.value = {
        telephone,
        nom: client.nom,
        prenoms: client.prenoms,
        cni: client.cni,
    };
}

watchDebounced(
    () => client.telephone,
    async (telephone) => {
        const telephoneRecherche = telephone.trim();
        const sequence = ++sequenceRechercheClient;
        retirerAncienClientAuto(telephoneRecherche);

        if (!telephoneRecherche || telephoneRecherche.length < 3) return;

        try {
            const donnees = (await window.api.vente.rechercherClient(telephoneRecherche)) as ClientRecherche | null;
            const rechercheToujoursCourante = sequence === sequenceRechercheClient && client.telephone.trim() === telephoneRecherche;
            if (!rechercheToujoursCourante) return;

            if (donnees) {
                appliquerClientTrouve(donnees, telephoneRecherche);
            } else {
                clientRempliAuto.value = null;
            }
        } catch (e) {
            if (sequence === sequenceRechercheClient) {
                clientRempliAuto.value = null;
                erreur.value = messageErreurInconnue(e, 'Impossible de synchroniser le client avec la caisse serveur.');
            }
        }
    },
    { debounce: 300 },
);

function selectionnerVoyage(voyageId: number | null) {
    const voyage = voyagesDisponibles.value.find((v) => v.id === voyageId) ?? null;
    voyageSelectionne.value = voyage;
    placeSelectionnee.value = voyage?.premiere_place_libre ?? null;
}

const voyageIdSelectionne = computed<number | null>({
    get: () => voyageSelectionne.value?.id ?? null,
    set: (id) => selectionnerVoyage(id),
});

const numeroDepartLabel = (numero: number) => (numero === 1 ? '1er départ' : `${numero}e départ`);

function dateDuJour() {
    const maintenant = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');

    return `${maintenant.getFullYear()}-${pad(maintenant.getMonth() + 1)}-${pad(maintenant.getDate())}`;
}

function dateComparable(date: string) {
    const valeur = date.trim();
    const iso = valeur.match(/^(\d{4})-(\d{2})-(\d{2})/);

    if (iso) {
        return `${iso[1]}-${iso[2]}-${iso[3]}`;
    }

    const fr = valeur.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);

    if (fr) {
        return `${fr[3]}-${fr[2].padStart(2, '0')}-${fr[1].padStart(2, '0')}`;
    }

    const parsed = new Date(valeur);
    if (Number.isNaN(parsed.getTime())) {
        return null;
    }

    const pad = (n: number) => String(n).padStart(2, '0');

    return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`;
}

function voyageNonPasse(voyage: VoyageDisponible) {
    const depart = dateComparable(voyage.date_depart);

    return depart !== null && depart >= dateDuJour();
}

function formatDateAffichee(date: string) {
    const [annee, mois, jour] = date.slice(0, 10).split('-');

    return annee && mois && jour ? `${jour}/${mois}/${annee}` : date;
}

const libelleVoyage = (voyage: VoyageDisponible) =>
    `${formatDateAffichee(voyage.date_depart)} · ${voyage.heure_depart} · ${numeroDepartLabel(voyage.numero_depart)} · ${voyage.itineraire ?? ''} · ${voyage.vehicule_immatriculation} · ${voyage.places_occupees.length}/${voyage.nombre_places} places`;

function resetTout() {
    void nettoyerCachePdfPrepare();
    villeArriveeId.value = null;
    rechercheVille.value = '';
    voyagesDisponibles.value = [];
    voyageSelectionne.value = null;
    trajetActuel.value = null;
    tarifActuel.value = null;
    typeBillet.value = 'aller';
    tarification.value = 'ordinaire';
    timbre.value = 0;
    placeSelectionnee.value = null;
    messageAucunVoyage.value = null;
    client.nom = '';
    client.prenoms = '';
    client.telephone = '';
    client.cni = '';
    clientRempliAuto.value = null;
    sequenceRechercheClient++;
    erreur.value = null;
    recus.value = [];
    confirmationOuverte.value = false;
    venteEffectuee.value = false;
}

defineExpose({ resetTout });

function annuler() {
    resetTout();
    emit('fermer');
}

type ResultatImpression = { ok: boolean; erreur?: string };

function messageErreurInconnue(erreur: unknown, defaut: string) {
    if (!(erreur instanceof Error)) return defaut;

    return erreur.message
        .replace(/^Error invoking remote method '[^']+': Error: /, '')
        .replace(/^Error invoking remote method "[^"]+": Error: /, '');
}

// La zone d'impression ne contient qu'une seule partie à la fois. C'est
// important pour éviter qu'un PDF capture le ticket + le talon ensemble.
const partieImpression = ref<'ticket' | 'talon' | null>(null);

function attendre(ms: number) {
    return new Promise<void>((resolve) => {
        setTimeout(resolve, ms);
    });
}

function attendreRenduImpression() {
    return new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => resolve());
        });
    });
}

async function imprimer(partie: 'ticket' | 'talon'): Promise<ResultatImpression> {
    partieImpression.value = partie;
    try {
        await nextTick();
        await attendreRenduImpression();
        return await window.api.impression.imprimerTicket(hauteurZoneImpressionMm());
    } finally {
        partieImpression.value = null;
    }
}

function empreinteTicketCourant() {
    return JSON.stringify({
        agenceId: props.agenceId,
        villeDepartId: props.villeDepartId,
        villeArriveeId: villeArriveeId.value,
        voyageId: voyageSelectionne.value?.id ?? null,
        trajetId: trajetActuel.value?.id ?? null,
        place: placeSelectionnee.value,
        typeBillet: typeBillet.value,
        tarification: tarification.value,
        prix: prixAffiche.value,
        timbre: timbre.value || 0,
        total: totalAPayer.value,
        client: {
            telephone: client.telephone.trim(),
            nom: client.nom.trim(),
            prenoms: client.prenoms.trim(),
            cni: client.cni.trim(),
        },
        vendeur: session.nom,
        userId: session.userId,
        agentId: session.agentId,
    });
}

function formatDateHeureLocale(iso: string) {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');

    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function supprimerPdfPrepare(id: string | null | undefined) {
    if (!id) return;

    try {
        await window.api.impression.supprimerPdfPrepare(id);
    } catch {
        // Le PDF a peut-être déjà été consommé par l'impression.
    }
}

function logDiagnostic(niveau: 'info' | 'warn', message: string, contexte?: Record<string, unknown>) {
    void window.api.diagnostic.log(niveau, message, contexte).catch(() => undefined);
}

async function nettoyerCachePdfPrepare() {
    sequencePreparationPdf++;
    if (minuteriePreparationPdf) {
        clearTimeout(minuteriePreparationPdf);
        minuteriePreparationPdf = null;
    }

    const cache = cachePdfTicket.value;
    cachePdfTicket.value = null;
    if (cache) {
        logDiagnostic('info', 'Préparation ticket invalidée', {
            numero: cache.numero,
            age_ms: Date.now() - cache.creeLe,
        });
        await Promise.all([
            supprimerPdfPrepare(cache.ticketId),
            supprimerPdfPrepare(cache.talonId),
        ]);
    }
}

async function creerRecuPrepare(numero: string, createdAtIso: string): Promise<Recu | null> {
    if (!props.agenceId || !voyageSelectionne.value || !trajetActuel.value || !placeSelectionnee.value) {
        return null;
    }

    const [agence, compagnie] = await Promise.all([
        window.api.config.agenceActuelle(),
        window.api.config.compagnieActuelle(),
    ]);
    const villeArrivee = props.villes.find((v) => v.id === villeArriveeId.value)?.nom ?? '';
    const villeDepart = agence?.ville_nom ?? props.villes.find((v) => v.id === props.villeDepartId)?.nom ?? '';
    const nomClient = [client.prenoms.trim(), client.nom.trim()].filter(Boolean).join(' ') || client.telephone.trim() || null;

    return {
        uuid: '',
        numero,
        numero_place: placeSelectionnee.value,
        type_billet: typeBillet.value,
        tarification: tarification.value,
        montant: prixAffiche.value,
        timbre: timbre.value || 0,
        total: totalAPayer.value,
        created_at: formatDateHeureLocale(createdAtIso),
        agence: agence?.nom ?? '',
        ville_depart: villeDepart,
        ville_arrivee: villeArrivee,
        date_depart: formatDateAffichee(voyageSelectionne.value.date_depart),
        heure_depart: voyageSelectionne.value.heure_depart,
        vehicule: voyageSelectionne.value.vehicule_immatriculation,
        client: nomClient,
        vendeur: session.nom || 'Caisse',
        compagnie,
    };
}

async function preparerPdfPartie(recu: Recu, partie: 'ticket' | 'talon') {
    recus.value = [recu];
    partieImpression.value = partie;

    try {
        await nextTick();
        await attendreRenduImpression();
        const resultat = await window.api.impression.preparerPdf(hauteurZoneImpressionMm());
        if (!resultat.ok) {
            throw new Error(resultat.erreur);
        }

        return resultat.id;
    } finally {
        partieImpression.value = null;
    }
}

async function lancerPreparationPdfTicket(source: SourcePreparationPdf) {
    if (!peutVendre.value || !voyageSelectionne.value || !trajetActuel.value) return;

    const sequence = ++sequencePreparationPdf;
    const empreinte = empreinteTicketCourant();
    const numero = await window.api.vente.preparerNumero();
    if (!numero) {
        logDiagnostic('info', 'Préparation ticket ignorée : aucun numéro préparé disponible', { source });
        return;
    }
    if (sequence !== sequencePreparationPdf || empreinte !== empreinteTicketCourant()) {
        logDiagnostic('info', 'Préparation ticket abandonnée : données modifiées avant le reçu', { source, numero });
        return;
    }

    const createdAtIso = new Date().toISOString();
    const recu = await creerRecuPrepare(numero, createdAtIso);
    if (!recu || sequence !== sequencePreparationPdf || empreinte !== empreinteTicketCourant()) {
        logDiagnostic('info', 'Préparation ticket abandonnée : reçu devenu obsolète', { source, numero });
        return;
    }

    let ticketId: string | null = null;
    let talonId: string | null = null;

    try {
        logDiagnostic('info', 'Préparation ticket démarrée', {
            source,
            numero,
            voyage_id: voyageSelectionne.value.id,
            place: placeSelectionnee.value,
        });
        ticketId = await preparerPdfPartie(recu, 'ticket');
        if (sequence !== sequencePreparationPdf || empreinte !== empreinteTicketCourant()) {
            logDiagnostic('info', 'Préparation ticket abandonnée : ticket PDF obsolète', { source, numero });
            return;
        }

        talonId = await preparerPdfPartie(recu, 'talon');
        if (sequence !== sequencePreparationPdf || empreinte !== empreinteTicketCourant()) {
            logDiagnostic('info', 'Préparation ticket abandonnée : talon PDF obsolète', { source, numero });
            return;
        }

        cachePdfTicket.value = {
            empreinte,
            numero,
            createdAtIso,
            ticketId,
            talonId,
            creeLe: Date.now(),
        };
        logDiagnostic('info', 'Préparation ticket prête', {
            source,
            numero,
            voyage_id: voyageSelectionne.value.id,
            place: placeSelectionnee.value,
        });
        ticketId = null;
        talonId = null;
    } catch (e) {
        logDiagnostic('warn', 'Préparation PDF ticket ignorée', {
            source,
            numero,
            erreur: messageErreurInconnue(e, 'Erreur inconnue'),
        });
    } finally {
        partieImpression.value = null;
        if (ticketId) await supprimerPdfPrepare(ticketId);
        if (talonId) await supprimerPdfPrepare(talonId);
    }
}

function programmerPreparationPdfTicket(source: SourcePreparationPdf, delaiMs: number) {
    void nettoyerCachePdfPrepare();
    if (!peutVendre.value) {
        logDiagnostic('info', 'Préparation ticket non programmée : formulaire incomplet', { source });
        return;
    }

    if (minuteriePreparationPdf) clearTimeout(minuteriePreparationPdf);
    logDiagnostic('info', 'Préparation ticket programmée', {
        source,
        delai_ms: delaiMs,
        voyage_id: voyageSelectionne.value?.id ?? null,
        place: placeSelectionnee.value,
    });
    minuteriePreparationPdf = setTimeout(() => {
        preparationPdfEnCours.value = lancerPreparationPdfTicket(source)
            .catch((e) => logDiagnostic('warn', 'Préparation PDF ticket interrompue', {
                source,
                erreur: messageErreurInconnue(e, 'Erreur inconnue'),
            }))
            .finally(() => {
                preparationPdfEnCours.value = null;
            });
    }, delaiMs);
}

function demarrerPreparationPdfMaintenant() {
    if (minuteriePreparationPdf) {
        clearTimeout(minuteriePreparationPdf);
        minuteriePreparationPdf = null;
    }

    if (!peutVendre.value || preparationPdfEnCours.value || cachePdfPret()) {
        logDiagnostic('info', 'Préparation ticket immédiate ignorée', {
            source: 'confirmation',
            formulaire_pret: peutVendre.value,
            preparation_en_cours: !!preparationPdfEnCours.value,
            cache_pret: !!cachePdfPret(),
        });
        return preparationPdfEnCours.value;
    }

    logDiagnostic('info', 'Préparation ticket lancée immédiatement', { source: 'confirmation' });
    preparationPdfEnCours.value = lancerPreparationPdfTicket('confirmation')
        .catch((e) => logDiagnostic('warn', 'Préparation PDF ticket interrompue', {
            source: 'confirmation',
            erreur: messageErreurInconnue(e, 'Erreur inconnue'),
        }))
        .finally(() => {
            preparationPdfEnCours.value = null;
        });

    return preparationPdfEnCours.value;
}

async function assurerPreparationPdfAvantVente() {
    if (cachePdfPret()) return;

    demarrerPreparationPdfMaintenant();
    if (preparationPdfEnCours.value) {
        await preparationPdfEnCours.value;
    }
}

function cachePdfPret() {
    const cache = cachePdfTicket.value;
    if (!cache) return null;
    if (Date.now() - cache.creeLe > DUREE_VALIDITE_PDF_PREPARE_MS) {
        logDiagnostic('info', 'Cache ticket expiré', {
            numero: cache.numero,
            age_ms: Date.now() - cache.creeLe,
        });
        return null;
    }
    if (cache.empreinte !== empreinteTicketCourant()) {
        logDiagnostic('info', 'Cache ticket obsolète : données modifiées', {
            numero: cache.numero,
            age_ms: Date.now() - cache.creeLe,
        });
        return null;
    }

    return cache;
}

async function imprimerDepuisCacheOuClassique(partie: 'ticket' | 'talon', idPrepare?: string | null) {
    if (!idPrepare) {
        return await imprimer(partie);
    }

    try {
        return await window.api.impression.imprimerPdfPrepare(idPrepare);
    } catch (e) {
        return {
            ok: false,
            erreur: messageErreurInconnue(e, "L'impression préparée n'a pas pu être lancée."),
        };
    }
}

watch(
    () => [
        props.agenceId,
        props.villeDepartId,
        villeArriveeId.value,
        voyageSelectionne.value?.id ?? null,
        trajetActuel.value?.id ?? null,
        placeSelectionnee.value,
        typeBillet.value,
        tarification.value,
        prixAffiche.value,
        timbre.value || 0,
        totalAPayer.value,
        client.telephone,
        client.nom,
        client.prenoms,
        client.cni,
        session.userId,
        session.agentId,
    ],
    (valeurs, anciennes) => {
        const source: SourcePreparationPdf = valeurs[3] !== anciennes?.[3]
            ? 'selection_voyage'
            : valeurs[5] !== anciennes?.[5]
                ? 'selection_place'
                : 'modification_formulaire';
        const delai = source === 'modification_formulaire'
            ? DELAI_PREPARATION_APRES_MODIFICATION_MS
            : DELAI_PREPARATION_APRES_VOYAGE_MS;

        programmerPreparationPdfTicket(source, delai);
    },
);

onBeforeUnmount(() => {
    void nettoyerCachePdfPrepare();
});

function ouvrirConfirmationVente() {
    confirmationOuverte.value = true;
    void assurerPreparationPdfAvantVente();
}

/**
 * Enregistre la vente (après confirmation) puis imprime le ticket.
 * Le formulaire n'est PAS réinitialisé : on peut réimprimer le dernier
 * ticket, ou revendre directement (place suivante attribuée d'office).
 * « Nouveau ticket » remet le formulaire à zéro pour un autre client.
 */
async function vendre() {
    if (!peutVendre.value || !voyageSelectionne.value || !trajetActuel.value || !props.agenceId) return;

    await assurerPreparationPdfAvantVente();
    const cachePrepare = cachePdfPret();
    logDiagnostic(cachePrepare ? 'info' : 'warn', cachePrepare ? 'Cache ticket prêt avant vente' : 'Cache ticket absent avant vente, impression classique prévue', {
        numero: cachePrepare?.numero ?? null,
        voyage_id: voyageSelectionne.value.id,
        place: placeSelectionnee.value,
    });

    enVente.value = true;
    erreur.value = null;
    const idVoyageCourant = voyageSelectionne.value.id;

    try {
        const imprimante = await window.api.impression.verifierDisponible();
        if (!imprimante.ok) {
            erreur.value = imprimante.erreur ?? "Aucune imprimante ticket utilisable n'est disponible.";
            confirmationOuverte.value = false;
            return;
        }

        const reponse = (await window.api.vente.vendre({
            agenceId: props.agenceId,
            voyageId: voyageSelectionne.value.id,
            trajetId: trajetActuel.value.id,
            agentId: session.agentId,
            userId: session.userId,
            typeBillet: typeBillet.value,
            tarification: tarification.value,
            numeroPlace: placeSelectionnee.value,
            timbre: timbre.value || 0,
            client: { telephone: client.telephone || null, nom: client.nom || null, prenoms: client.prenoms || null, cni: client.cni || null },
            numeroTicket: cachePrepare?.numero ?? null,
            createdAt: cachePrepare?.createdAtIso ?? null,
        })) as { ok: boolean; ticket?: Recu; erreur?: string };

        if (!reponse.ok || !reponse.ticket) {
            erreur.value = reponse.erreur ?? 'Une erreur est survenue.';
            confirmationOuverte.value = false;
            await nettoyerCachePdfPrepare();
            if (venteRefuseePourPlace(erreur.value)) {
                await chargerVoyagesEtDemanderReselection();
            } else {
                await chargerVoyagesConservantSelection(idVoyageCourant);
            }
            return;
        }

        confirmationOuverte.value = false;
        recus.value = [reponse.ticket];
        const cacheUtilisable = cachePrepare && reponse.ticket.numero === cachePrepare.numero ? cachePrepare : null;
        if (cachePrepare && !cacheUtilisable) {
            logDiagnostic('warn', 'Cache ticket refusé : numéro final différent', {
                numero_prepare: cachePrepare.numero,
                numero_final: reponse.ticket.numero,
            });
            void nettoyerCachePdfPrepare();
        } else if (cacheUtilisable) {
            logDiagnostic('info', 'Cache ticket utilisé pour impression', {
                numero: cacheUtilisable.numero,
                ticket_pdf: cacheUtilisable.ticketId,
                talon_pdf: cacheUtilisable.talonId,
            });
            cachePdfTicket.value = null;
        }

        let impression: ResultatImpression;
        try {
            impression = await imprimerDepuisCacheOuClassique('ticket', cacheUtilisable?.ticketId);
        } catch (e) {
            impression = {
                ok: false,
                erreur: messageErreurInconnue(e, "L'impression n'a pas pu être lancée."),
            };
        }

        if (!impression.ok) {
            const motif = impression.erreur ?? 'Impression non confirmée par le système.';
            recus.value = [];
            logDiagnostic('warn', 'Impression ticket échouée, annulation demandée', {
                numero: reponse.ticket.numero,
                via_cache: !!cacheUtilisable,
                motif,
            });

            try {
                await window.api.vente.annulerImpression(reponse.ticket.uuid, motif);
                erreur.value = `Ticket ${reponse.ticket.numero} annulé : ${motif}. La vente n'est pas comptabilisée.`;
            } catch (e) {
                erreur.value = `Impression non confirmée pour le ticket ${reponse.ticket.numero}, mais l'annulation automatique a échoué : ${messageErreurInconnue(e, motif)}. Vérifiez avant de revendre la place.`;
            }

            if (cacheUtilisable) {
                await supprimerPdfPrepare(cacheUtilisable.talonId);
            }
            await chargerVoyagesConservantSelection(idVoyageCourant);
            return;
        }

        // Le ticket client est sorti : le talon part en second job (coupe entre
        // les deux). La vente n'est validée qu'après les deux sorties.
        let erreurTalon: string | null = null;
        try {
            logDiagnostic('info', 'Pause avant impression talon', {
                numero: reponse.ticket.numero,
                pause_ms: PAUSE_AVANT_TALON_MS,
            });
            await attendre(PAUSE_AVANT_TALON_MS);
            const talon = await imprimerDepuisCacheOuClassique('talon', cacheUtilisable?.talonId);
            if (!talon.ok) {
                erreurTalon = talon.erreur ?? 'erreur inconnue';
                logDiagnostic('warn', 'Impression talon échouée', {
                    numero: reponse.ticket.numero,
                    via_cache: !!cacheUtilisable,
                    erreur: erreurTalon,
                });
            }
        } catch (e) {
            erreurTalon = messageErreurInconnue(e, 'erreur inconnue');
            logDiagnostic('warn', 'Impression talon interrompue', {
                numero: reponse.ticket.numero,
                via_cache: !!cacheUtilisable,
                erreur: erreurTalon,
            });
        }

        if (erreurTalon) {
            erreur.value = `Le ticket ${reponse.ticket.numero} est sorti, mais le talon de contrôle n'est pas sorti : ${erreurTalon}. La vente reste en attente et n'est pas comptabilisée.`;
            await chargerVoyagesConservantSelection(idVoyageCourant);
            return;
        }

        const confirmationImpression = await window.api.vente.confirmerImpression(reponse.ticket.uuid);
        if (!confirmationImpression.ok) {
            erreur.value = confirmationImpression.erreur
                ?? `Le ticket ${reponse.ticket.numero} a peut-être été imprimé, mais la validation locale a échoué. Vérifiez avant de revendre la place.`;
            return;
        }

        if (!voyageSelectionne.value?.places_occupees.includes(reponse.ticket.numero_place)) {
            voyageSelectionne.value?.places_occupees.push(reponse.ticket.numero_place);
        }

        emit('vendu', {
            uuid: reponse.ticket.uuid,
            numero_ticket: reponse.ticket.numero,
            heure: reponse.ticket.created_at.split(' ')[1],
            trajet: trajetActuel.value.nom ?? '',
            numero_place: reponse.ticket.numero_place,
            type_billet: reponse.ticket.type_billet,
            montant: reponse.ticket.montant,
            timbre: reponse.ticket.timbre,
            total: reponse.ticket.total,
            client: reponse.ticket.client,
        });

        // Le formulaire reste tel quel ; la prochaine place libre est déjà
        // sélectionnée pour une éventuelle revente immédiate.
        venteEffectuee.value = true;
        await chargerVoyagesConservantSelection(idVoyageCourant);
    } catch (e) {
        erreur.value = messageErreurInconnue(e, 'Une erreur est survenue pendant la vente.');
    } finally {
        const cache = cachePdfTicket.value;
        if (cache && Date.now() - cache.creeLe > DUREE_VALIDITE_PDF_PREPARE_MS) {
            void nettoyerCachePdfPrepare();
        }
        enVente.value = false;

        if (venteEffectuee.value && peutVendre.value) {
            logDiagnostic('info', 'Préparation ticket relancée après vente pour Vendre à nouveau', {
                voyage_id: voyageSelectionne.value?.id ?? null,
                place: placeSelectionnee.value,
            });
            programmerPreparationPdfTicket('selection_place', DELAI_PREPARATION_APRES_VOYAGE_MS);
        }
    }
}

// Recharge la liste des voyages (places à jour) sans réinitialiser le reste du formulaire.
async function chargerVoyagesConservantSelection(voyageId: number) {
    if (!props.agenceId || !props.villeDepartId || !villeArriveeId.value) return;

    const data = (await window.api.vente.rechercherVoyages({
        agenceId: props.agenceId,
        villeDepartId: props.villeDepartId,
        villeArriveeId: villeArriveeId.value,
    })) as { voyages: VoyageDisponible[] };

    const voyagesNonPasses = data.voyages.filter(voyageNonPasse);

    voyagesDisponibles.value = voyagesNonPasses;
    const voyage = voyagesNonPasses.find((v) => v.id === voyageId) ?? null;
    voyageSelectionne.value = voyage;
    placeSelectionnee.value = voyage?.premiere_place_libre ?? null;
}

async function chargerVoyagesEtDemanderReselection() {
    if (!props.agenceId || !props.villeDepartId || !villeArriveeId.value) return;

    const data = (await window.api.vente.rechercherVoyages({
        agenceId: props.agenceId,
        villeDepartId: props.villeDepartId,
        villeArriveeId: villeArriveeId.value,
    })) as { voyages: VoyageDisponible[] };

    voyagesDisponibles.value = data.voyages.filter(voyageNonPasse);
    voyageSelectionne.value = null;
    placeSelectionnee.value = null;
    venteEffectuee.value = false;
}

function venteRefuseePourPlace(message: string | null) {
    return !!message && /place/i.test(message);
}

/** Remet le formulaire à zéro pour un nouveau client (la fenêtre reste ouverte). */
function nouveauTicket() {
    resetTout();
}

const formatMontant = (montant: number) => new Intl.NumberFormat('fr-FR').format(montant);
</script>

<template>
    <div class="flex min-h-0 flex-1 flex-col">
        <p v-if="erreur" class="mx-6 mt-4 shrink-0 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {{ erreur }}
        </p>

        <!-- Zone des 3 colonnes : hauteur fixe, chacune scrolle indépendamment. -->
        <div class="grid min-h-0 flex-1 grid-cols-1 gap-4 px-6 py-4 lg:grid-cols-[230px_1fr_320px]">
            <!-- Colonne gauche : destinations -->
            <section class="flex min-h-0 min-w-0 flex-col rounded-xl border">
                <p class="shrink-0 flex items-center gap-2 border-b bg-muted/50 px-3 py-2 text-sm font-semibold">
                    <MapPin class="size-4" /> Destinations
                </p>
                <div class="shrink-0 p-2">
                    <Input
                        v-model="rechercheVille"
                        placeholder="Rechercher une ville..."
                        class="h-8"
                    />
                </div>
                <div class="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-2">
                    <button
                        v-for="ville in villesAffichables"
                        :key="ville.id"
                        type="button"
                        class="rounded-md px-3 py-1.5 text-left text-sm transition-colors"
                        :class="villeArriveeId === ville.id
                            ? 'bg-primary font-medium text-primary-foreground'
                            : 'hover:bg-muted'"
                        @click="selectionnerVille(ville.id)"
                    >
                        {{ ville.nom }}
                    </button>
                    <p v-if="villesAffichables.length === 0" class="px-3 py-2 text-sm text-muted-foreground">
                        Aucune ville trouvée.
                    </p>
                </div>
            </section>

            <!-- Colonne du milieu : client + départ (défilement indépendant) -->
            <div class="flex min-h-0 min-w-0 flex-col gap-4 overflow-y-auto pr-1">
                <section class="rounded-xl border">
                    <p class="flex items-center gap-2 border-b bg-muted/50 px-3 py-2 text-sm font-semibold">
                        <User class="size-4" /> Informations du client
                        <span class="font-normal text-muted-foreground">(facultatif)</span>
                    </p>
                    <div class="grid grid-cols-2 gap-3 p-4">
                        <div class="grid gap-1.5">
                            <Label for="client_telephone">Téléphone</Label>
                            <Input id="client_telephone" v-model="client.telephone" placeholder="Ex : 0102030405" />
                        </div>
                        <div class="grid gap-1.5">
                            <Label for="client_nom">Nom</Label>
                            <Input id="client_nom" v-model="client.nom" />
                        </div>
                        <div class="grid gap-1.5">
                            <Label for="client_prenoms">Prénoms</Label>
                            <Input id="client_prenoms" v-model="client.prenoms" />
                        </div>
                        <div class="grid gap-1.5">
                            <Label for="client_cni">CNI <span class="text-muted-foreground">(facultatif)</span></Label>
                            <Input id="client_cni" v-model="client.cni" placeholder="N° carte nationale d'identité" />
                        </div>
                    </div>
                </section>

                <section class="rounded-xl border">
                    <p class="flex items-center gap-2 border-b bg-muted/50 px-3 py-2 text-sm font-semibold">
                        <Ticket class="size-4" /> Départ
                    </p>
                    <div class="flex flex-col gap-3 p-4">
                        <div v-if="trajetActuel" class="flex items-center justify-between">
                            <Badge variant="secondary">Trajet : {{ trajetActuel.nom }}</Badge>
                            <Badge v-if="placeSelectionnee" variant="default">
                                Siège N° {{ placeSelectionnee }}
                            </Badge>
                        </div>

                        <p v-if="!villeArriveeId" class="text-sm text-muted-foreground">
                            Choisissez une ville de destination à gauche.
                        </p>
                        <p v-else-if="chargementVoyages" class="text-sm text-muted-foreground">
                            Chargement des voyages...
                        </p>
                        <p v-else-if="messageAucunVoyage" class="text-sm text-muted-foreground">
                            {{ messageAucunVoyage }}
                        </p>

                        <div v-else class="grid min-w-0 gap-1.5">
                            <Label>Voyage</Label>
                            <Select v-model="voyageIdSelectionne">
                                <SelectTrigger class="h-10 w-full min-w-0 max-w-full overflow-hidden *:data-[slot=select-value]:block *:data-[slot=select-value]:min-w-0 *:data-[slot=select-value]:flex-1 *:data-[slot=select-value]:truncate">
                                    <SelectValue placeholder="Choisir un voyage" />
                                </SelectTrigger>
                                <SelectContent class="w-[var(--reka-select-trigger-width)] max-w-[min(42rem,calc(100vw-2rem))]">
                                    <SelectItem
                                        v-for="voyage in voyagesDisponibles"
                                        :key="voyage.id"
                                        :value="voyage.id"
                                        class="items-start whitespace-normal pr-8 leading-snug [&_[data-slot=select-item-text]]:block [&_[data-slot=select-item-text]]:min-w-0 [&_[data-slot=select-item-text]]:whitespace-normal"
                                    >
                                        {{ libelleVoyage(voyage) }}
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <!-- Récapitulatif du voyage choisi : les infos clés en évidence. -->
                        <div
                            v-if="voyageSelectionne"
                            class="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm sm:grid-cols-3"
                        >
                            <div>
                                <p class="text-xs text-muted-foreground">Date</p>
                                <p class="font-semibold">{{ formatDateAffichee(voyageSelectionne.date_depart) }}</p>
                            </div>
                            <div>
                                <p class="text-xs text-muted-foreground">Heure</p>
                                <p class="font-semibold">
                                    {{ voyageSelectionne.heure_depart }}
                                    <span class="font-normal text-muted-foreground">
                                        ({{ numeroDepartLabel(voyageSelectionne.numero_depart) }})
                                    </span>
                                </p>
                            </div>
                            <div>
                                <p class="text-xs text-muted-foreground">Itinéraire</p>
                                <p class="font-semibold">{{ voyageSelectionne.itineraire }}</p>
                            </div>
                            <div>
                                <p class="text-xs text-muted-foreground">Bus</p>
                                <p class="font-semibold">{{ voyageSelectionne.vehicule_immatriculation }}</p>
                            </div>
                            <div>
                                <p class="text-xs text-muted-foreground">Chauffeur</p>
                                <p class="font-semibold">{{ voyageSelectionne.chauffeur ?? '—' }}</p>
                            </div>
                            <div>
                                <p class="text-xs text-muted-foreground">Places restantes</p>
                                <p class="font-semibold">
                                    {{ voyageSelectionne.nombre_places - voyageSelectionne.places_occupees.length }}
                                    / {{ voyageSelectionne.nombre_places }}
                                </p>
                            </div>
                        </div>
                    </div>
                </section>

                <section class="rounded-xl border">
                    <p class="flex items-center gap-2 border-b bg-muted/50 px-3 py-2 text-sm font-semibold">
                        <Banknote class="size-4" /> Tarif
                    </p>
                    <div class="flex flex-col gap-3 p-4">
                        <div class="grid gap-1.5">
                            <Label>Tarification</Label>
                            <Select v-model="tarification">
                                <SelectTrigger class="w-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ordinaire">Ordinaire</SelectItem>
                                    <SelectItem value="vip" :disabled="!!tarifActuel && !vipDisponible">
                                        VIP{{ tarifActuel && !vipDisponible ? ' (non défini pour ce trajet)' : '' }}
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div class="flex flex-col gap-2">
                            <label
                                class="flex cursor-pointer items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
                                :class="typeBillet === 'aller' ? 'border-primary bg-primary/5 font-medium' : ''"
                            >
                                <span class="flex items-center gap-2">
                                    <input
                                        v-model="typeBillet"
                                        type="radio"
                                        value="aller"
                                        class="size-4 accent-primary"
                                    />
                                    Aller simple
                                </span>
                                <span v-if="grilleActive" class="font-semibold">
                                    {{ formatMontant(grilleActive.aller ?? 0) }} FCFA
                                </span>
                            </label>
                            <label
                                class="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
                                :class="[
                                    allerRetourDisponible ? 'cursor-pointer' : 'cursor-not-allowed text-muted-foreground',
                                    typeBillet === 'aller_retour' ? 'border-primary bg-primary/5 font-medium' : '',
                                ]"
                            >
                                <span class="flex items-center gap-2">
                                    <input
                                        v-model="typeBillet"
                                        type="radio"
                                        value="aller_retour"
                                        :disabled="!allerRetourDisponible"
                                        class="size-4 accent-primary"
                                    />
                                    Aller-retour
                                </span>
                                <span v-if="grilleActive && allerRetourDisponible" class="font-semibold">
                                    {{ formatMontant(grilleActive.aller_retour ?? 0) }} FCFA
                                </span>
                                <span v-else-if="tarifActuel" class="text-xs">Non défini</span>
                            </label>
                        </div>
                    </div>
                </section>
            </div>

            <!-- Colonne droite : type de ticket + places (défilement indépendant) -->
            <div class="flex min-h-0 min-w-0 flex-col gap-4 overflow-y-auto pr-1">
                <section class="shrink-0 rounded-xl border">
                    <p class="flex items-center gap-2 border-b bg-muted/50 px-3 py-2 text-sm font-semibold">
                        <Banknote class="size-4" /> Type de ticket
                    </p>
                    <div class="flex flex-col gap-3 p-4">
                        <div class="flex items-center justify-between">
                            <span class="text-sm text-muted-foreground">Prix</span>
                            <span class="text-lg font-semibold">{{ formatMontant(prixAffiche) }} FCFA</span>
                        </div>
                        <div class="flex items-center justify-between gap-3">
                            <Label for="timbre" class="text-sm text-muted-foreground">Timbre</Label>
                            <Input
                                id="timbre"
                                v-model.number="timbre"
                                type="number"
                                min="0"
                                step="50"
                                class="h-8 w-28 text-right"
                            />
                        </div>
                        <div class="flex items-center justify-between border-t pt-3">
                            <span class="text-sm font-medium">Total à payer</span>
                            <span class="text-2xl font-bold">{{ formatMontant(totalAPayer) }} FCFA</span>
                        </div>
                    </div>
                </section>

                <section class="shrink-0 rounded-xl border">
                    <p class="flex items-center gap-2 border-b bg-muted/50 px-3 py-2 text-sm font-semibold">
                        <Armchair class="size-4" /> Places
                        <Badge v-if="placeSelectionnee" variant="default" class="ml-auto">
                            N° {{ placeSelectionnee }} attribuée
                        </Badge>
                    </p>
                    <div class="p-4">
                        <p v-if="!voyageSelectionne" class="text-sm text-muted-foreground">
                            Sélectionnez un voyage pour voir le plan du bus.
                        </p>
                        <SeatMap
                            v-else
                            :nombre-places="voyageSelectionne.nombre_places"
                            :places-occupees="voyageSelectionne.places_occupees"
                            :place-selectionnee="placeSelectionnee"
                            @select="(place) => (placeSelectionnee = place)"
                        />
                    </div>
                </section>
            </div>
        </div>

        <!-- Barre d'actions : ne fait pas partie du flux scrollable. -->
        <div class="shrink-0 flex flex-wrap items-center justify-end gap-2 border-t bg-background px-6 py-3">
            <span v-if="voyageSelectionne" class="mr-auto text-sm text-muted-foreground">
                Total à encaisser :
                <span class="text-lg font-bold text-foreground">{{ formatMontant(totalAPayer) }} FCFA</span>
            </span>
            <Button variant="outline" @click="annuler">
                <X />
                Fermer
            </Button>
            <Button
                v-if="venteEffectuee"
                variant="secondary"
                @click="nouveauTicket"
            >
                <RotateCcw />
                Nouveau ticket
            </Button>
            <Button :disabled="!peutVendre || enVente" @click="ouvrirConfirmationVente">
                <LoaderCircle v-if="enVente" class="animate-spin" />
                <Ticket v-else />
                {{ enVente ? 'Impression en cours…' : venteEffectuee ? 'Vendre à nouveau' : 'Vendre' }}
            </Button>
        </div>
    </div>

    <!-- Confirmation avant d'enregistrer la vente : évite les erreurs de clic. -->
    <Dialog v-model:open="confirmationOuverte">
        <DialogContent class="sm:max-w-md">
            <DialogHeader>
                <DialogTitle>Confirmer la vente ?</DialogTitle>
                <DialogDescription>
                    Vérifiez les informations avant d'imprimer le ticket.
                </DialogDescription>
            </DialogHeader>

            <div v-if="voyageSelectionne && trajetActuel" class="space-y-1.5 rounded-lg border bg-muted/30 p-3 text-sm">
                <div class="flex justify-between">
                    <span class="text-muted-foreground">Trajet</span>
                    <span class="font-medium">{{ trajetActuel.nom }}</span>
                </div>
                <div class="flex justify-between">
                    <span class="text-muted-foreground">Départ</span>
                    <span class="font-medium">
                        {{ formatDateAffichee(voyageSelectionne.date_depart) }} à {{ voyageSelectionne.heure_depart }}
                    </span>
                </div>
                <div class="flex justify-between">
                    <span class="text-muted-foreground">Place</span>
                    <span class="font-medium">N° {{ placeSelectionnee }}</span>
                </div>
                <div class="flex justify-between">
                    <span class="text-muted-foreground">Billet</span>
                    <span class="font-medium">
                        {{ typeBillet === 'aller' ? 'Aller simple' : 'Aller-retour' }}
                        · {{ tarification === 'vip' ? 'VIP' : 'Ordinaire' }}
                    </span>
                </div>
                <div v-if="client.nom || client.telephone" class="flex justify-between">
                    <span class="text-muted-foreground">Client</span>
                    <span class="font-medium">{{ [client.nom, client.prenoms].filter(Boolean).join(' ') || client.telephone }}</span>
                </div>
                <div class="flex justify-between border-t pt-1.5">
                    <span class="font-medium">Total à encaisser</span>
                    <span class="text-lg font-bold">{{ formatMontant(totalAPayer) }} FCFA</span>
                </div>
            </div>

            <DialogFooter class="gap-2">
                <Button variant="outline" @click="confirmationOuverte = false">
                    <X />
                    Fermer
                </Button>
                <Button :disabled="enVente" @click="vendre">
                    <LoaderCircle v-if="enVente" class="animate-spin" />
                    <Check v-else />
                    {{ enVente ? 'Impression…' : 'Confirmer' }}
                </Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>

    <!-- Zone d'impression : invisible à l'écran, seule visible à l'impression. -->
    <div v-if="partieImpression" class="zone-impression hidden print:block">
        <TicketRecu v-for="(r, index) in recus" :key="index" :recu="r" :partie="partieImpression" />
    </div>
</template>
