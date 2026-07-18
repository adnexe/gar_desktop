<script setup lang="ts">
import { watchDebounced } from '@vueuse/core';
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { Check, LoaderCircle, Mail, Package, Plus, Printer, Send, Trash2, UserRound, X } from '@lucide/vue';
import { Button } from '@/Components/ui/button';
import { Input } from '@/Components/ui/input';
import { Label } from '@/Components/ui/label';
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
import { useSessionStore } from '@/Stores/session';
import type { CourrierDuJour } from '@/types/courrier';

interface Ville { id: number; uuid: string; nom: string }
interface Agence { id: number; uuid: string; nom: string; ville_id: number }
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
const impressionTalon = ref(false);
const erreur = ref('');
const recu = ref<{
    numero_courrier: string;
    destination: string;
    agence_arrivee: string | null;
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
    agent: string | null;
    created_at: string;
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
    !!agenceArriveeId.value &&
    expediteur.nom.trim().length > 0 &&
    expediteur.telephone.trim().length > 0 &&
    destinataire.nom.trim().length > 0 &&
    destinataire.telephone.trim().length > 0 &&
    colisListe.value.length > 0 &&
    prixExpedition.value !== null &&
    !enregistrement.value,
);
type CachePdfCourrier = {
    empreinte: string;
    numero: string;
    createdAt: string;
    recuId: string;
    creeLe: number;
};
const cachePdfCourrier = ref<CachePdfCourrier | null>(null);
const preparationPdfCourrier = ref<Promise<void> | null>(null);
let sequencePreparationPdfCourrier = 0;
const DUREE_VALIDITE_PDF_COURRIER_MS = 45_000;

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
    void nettoyerCachePdfCourrier();
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

function dateHeureRecu() {
    return new Date().toLocaleString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function formatDateHeureRecu(iso: string) {
    return new Date(iso).toLocaleString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function nomComplet(personne: { nom: string; prenoms: string }) {
    return [personne.prenoms, personne.nom].filter(Boolean).join(' ').trim();
}

function resetSaisie() {
    void nettoyerCachePdfCourrier();
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
    void chargerVoyagesAgence();
}

function resetTout() {
    resetSaisie();
    recu.value = null;
}

defineExpose({ resetTout });

type ResultatImpression = { ok: boolean; erreur?: string };

function messageErreurInconnue(e: unknown, defaut: string) {
    if (!(e instanceof Error)) return defaut;

    return e.message
        .replace(/^Error invoking remote method '[^']+': Error: /, '')
        .replace(/^Error invoking remote method "[^"]+": Error: /, '');
}

// Le reçu sort automatiquement à la vente. L'étiquette/talon se lance ensuite
// manuellement, tant que le dernier courrier reste affiché dans le formulaire.
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

function logDiagnostic(niveau: 'info' | 'warn', message: string, contexte?: Record<string, unknown>) {
    void window.api.diagnostic.log(niveau, message, contexte).catch(() => undefined);
}

function empreinteCourrierCourante() {
    return JSON.stringify({
        agenceId: config.agence?.id ?? null,
        villeArriveeId: villeArriveeId.value,
        agenceArriveeId: agenceArriveeId.value,
        voyageId: voyageId.value,
        voyageUuid: voyageSelectionne.value?.uuid ?? null,
        userId: session.userId,
        agentId: session.agentId,
        prixExpedition: prixExpedition.value ?? 0,
        expediteur: { ...expediteur },
        destinataire: { ...destinataire },
        colis: colisListe.value.map((c) => ({ ...c })),
    });
}

async function supprimerPdfPrepare(id: string | null | undefined) {
    if (!id) return;

    try {
        await window.api.impression.supprimerPdfPrepare(id);
    } catch {
        // Le PDF a peut-être déjà été consommé par l'impression.
    }
}

async function nettoyerCachePdfCourrier() {
    sequencePreparationPdfCourrier++;
    const cache = cachePdfCourrier.value;
    cachePdfCourrier.value = null;
    if (cache) {
        logDiagnostic('info', 'Préparation courrier invalidée', {
            numero: cache.numero,
            age_ms: Date.now() - cache.creeLe,
        });
        await supprimerPdfPrepare(cache.recuId);
    }
}

function creerRecuCourrier(numero: string, createdAt: string, montantColisActuel = montantColis.value, montantTotalActuel = montantTotal.value) {
    if (!config.agence) return null;

    return {
        numero_courrier: numero,
        destination: villeArriveeNom.value,
        agence_arrivee: agenceArriveeNom.value || null,
        voyage: voyageSelectionne.value ? libelleVoyage(voyageSelectionne.value) : null,
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
        prix_expedition: prixExpedition.value ?? 0,
        montant_colis: montantColisActuel,
        montant_total: montantTotalActuel,
        agence_depart: config.agence.nom,
        agent: session.nom || null,
        created_at: formatDateHeureRecu(createdAt),
        compagnie: config.compagnie,
    };
}

async function preparerPdfCourrierPartie(recuPrepare: NonNullable<typeof recu.value>, partie: 'recu' | 'etiquette') {
    recu.value = recuPrepare;
    partieImpression.value = partie;

    try {
        await nextTick();
        const resultat = await window.api.impression.preparerPdf(hauteurZoneImpressionMm());
        if (!resultat.ok) throw new Error(resultat.erreur);
        return resultat.id;
    } finally {
        partieImpression.value = 'tout';
    }
}

function cachePdfCourrierPret() {
    const cache = cachePdfCourrier.value;
    if (!cache) return null;
    if (Date.now() - cache.creeLe > DUREE_VALIDITE_PDF_COURRIER_MS) {
        logDiagnostic('info', 'Cache courrier expiré', { numero: cache.numero, age_ms: Date.now() - cache.creeLe });
        return null;
    }
    if (cache.empreinte !== empreinteCourrierCourante()) {
        logDiagnostic('info', 'Cache courrier obsolète : données modifiées', { numero: cache.numero });
        return null;
    }

    return cache;
}

async function preparerPdfCourrier() {
    if (!config.agence || !peutEnvoyer.value) return;

    const sequence = ++sequencePreparationPdfCourrier;
    const empreinte = empreinteCourrierCourante();
    const numero = await window.api.courrier.preparerNumero(config.agence.id);
    if (!numero) {
        logDiagnostic('info', 'Préparation courrier ignorée : aucun numéro préparé disponible');
        return;
    }

    const createdAt = new Date().toISOString();
    const recuPrepare = creerRecuCourrier(numero, createdAt);
    if (!recuPrepare || sequence !== sequencePreparationPdfCourrier || empreinte !== empreinteCourrierCourante()) return;

    let recuId: string | null = null;

    try {
        logDiagnostic('info', 'Préparation courrier démarrée', { numero });
        recuId = await preparerPdfCourrierPartie(recuPrepare, 'recu');
        if (sequence !== sequencePreparationPdfCourrier || empreinte !== empreinteCourrierCourante()) {
            logDiagnostic('info', 'Préparation courrier abandonnée : reçu PDF obsolète', { numero });
            return;
        }

        cachePdfCourrier.value = { empreinte, numero, createdAt, recuId, creeLe: Date.now() };
        logDiagnostic('info', 'Préparation courrier prête', { numero, recu_pdf: recuId });
        recuId = null;
    } catch (e) {
        logDiagnostic('warn', 'Préparation PDF courrier ignorée', {
            numero,
            erreur: messageErreurInconnue(e, 'Erreur inconnue'),
        });
    } finally {
        partieImpression.value = 'tout';
        if (recuId) await supprimerPdfPrepare(recuId);
    }
}

function ouvrirConfirmation() {
    confirmationOuverte.value = true;
    void nettoyerCachePdfCourrier().then(() => {
        preparationPdfCourrier.value = preparerPdfCourrier()
            .catch((e) => logDiagnostic('warn', 'Préparation PDF courrier interrompue', {
                erreur: messageErreurInconnue(e, 'Erreur inconnue'),
            }))
            .finally(() => {
                preparationPdfCourrier.value = null;
            });
    });
}

async function fermerConfirmation() {
    confirmationOuverte.value = false;
    await nettoyerCachePdfCourrier();
}

async function imprimerDepuisCacheOuClassique(partie: 'recu' | 'etiquette', idPrepare?: string | null): Promise<ResultatImpression> {
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

async function imprimerTalon() {
    if (!recu.value || impressionTalon.value) return;

    erreur.value = '';
    impressionTalon.value = true;

    try {
        const imprimante = await window.api.impression.verifierDisponible();
        if (!imprimante.ok) {
            erreur.value = imprimante.erreur ?? "Aucune imprimante utilisable n'est disponible.";
            return;
        }

        const impression = await imprimer('etiquette');
        if (!impression.ok) {
            erreur.value = `Talon non imprimé : ${impression.erreur ?? 'Impression non confirmée par le système.'}`;
        }
    } catch (e) {
        erreur.value = `Talon non imprimé : ${messageErreurInconnue(e, "L'impression n'a pas pu être lancée.")}`;
    } finally {
        impressionTalon.value = false;
    }
}

async function envoyer() {
    if (!config.agence || !villeArriveeId.value || !agenceArriveeId.value || !session.userId) {
        erreur.value = "Choisissez la ville et l'agence de destination.";
        return;
    }

    if (preparationPdfCourrier.value) {
        // Attente bornée : si la préparation (lancée à l'ouverture de la
        // confirmation) n'aboutit pas vite, on part en voie classique —
        // jamais plus lent que l'ancienne méthode directe.
        await Promise.race([
            preparationPdfCourrier.value,
            new Promise((resolve) => setTimeout(resolve, 800)),
        ]);
    }
    const cachePrepare = cachePdfCourrierPret();
    logDiagnostic(cachePrepare ? 'info' : 'warn', cachePrepare ? 'Cache courrier prêt avant enregistrement' : 'Cache courrier absent avant enregistrement, impression classique prévue', {
        numero: cachePrepare?.numero ?? null,
    });

    enregistrement.value = true;
    erreur.value = '';
    const agenceActuelle = config.agence;
    const villeArriveeIdActuelle = villeArriveeId.value;
    const agenceArriveeIdActuelle = agenceArriveeId.value;
    const userId = session.userId;
    const prixExpeditionActuel = prixExpedition.value ?? 0;

    try {
        const imprimante = await window.api.impression.verifierDisponible();
        if (!imprimante.ok) {
            erreur.value = imprimante.erreur ?? "Aucune imprimante utilisable n'est disponible.";
            confirmationOuverte.value = false;
            return;
        }

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
            numeroCourrier: cachePrepare?.numero ?? null,
            createdAt: cachePrepare?.createdAt ?? null,
        })) as {
            ok: boolean;
            courrier?: { uuid: string; numeroCourrier: string; montantColis: number; montantTotal: number };
            erreur?: string;
        };

        if (!reponse.ok || !reponse.courrier) {
            erreur.value = reponse.erreur ?? "L'enregistrement a échoué.";
            confirmationOuverte.value = false;
            return;
        }

        confirmationOuverte.value = false;

        const destination = villes.value.find((v) => v.id === villeArriveeIdActuelle)?.nom ?? '';
        const dernierRecu = creerRecuCourrier(
            reponse.courrier.numeroCourrier,
            cachePrepare?.createdAt ?? new Date().toISOString(),
            reponse.courrier.montantColis,
            reponse.courrier.montantTotal,
        );
        if (!dernierRecu) {
            erreur.value = "Le reçu courrier n'a pas pu être préparé.";
            return;
        }
        recu.value = dernierRecu;
        const cacheUtilisable = cachePrepare && reponse.courrier.numeroCourrier === cachePrepare.numero ? cachePrepare : null;
        if (cachePrepare && !cacheUtilisable) {
            logDiagnostic('warn', 'Cache courrier refusé : numéro final différent', {
                numero_prepare: cachePrepare.numero,
                numero_final: reponse.courrier.numeroCourrier,
            });
            void nettoyerCachePdfCourrier();
        } else if (cacheUtilisable) {
            logDiagnostic('info', 'Cache courrier utilisé pour impression', {
                numero: cacheUtilisable.numero,
                recu_pdf: cacheUtilisable.recuId,
            });
            cachePdfCourrier.value = null;
        }

        let impression: ResultatImpression;
        try {
            impression = await imprimerDepuisCacheOuClassique('recu', cacheUtilisable?.recuId);
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

            if (cacheUtilisable) {
                await nettoyerCachePdfCourrier();
            }
            return;
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
            heure: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
            destination,
            destinataire: dernierRecu.destinataire_nom,
            montant_total: reponse.courrier.montantTotal,
        });

        resetSaisie();
    } catch (e) {
        erreur.value = messageErreurInconnue(e, "Une erreur est survenue lors de l'enregistrement.");
        confirmationOuverte.value = false;
    } finally {
        const cache = cachePdfCourrier.value;
        if (cache && Date.now() - cache.creeLe > DUREE_VALIDITE_PDF_COURRIER_MS) {
            void nettoyerCachePdfCourrier();
        }
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
                            <SelectItem v-for="ville in villes" :key="ville.id" :value="ville.id">{{ ville.nom }}</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div class="space-y-1.5">
                    <Label>Agence de destination</Label>
                    <Select v-model="agenceArriveeId" :disabled="!villeArriveeId">
                        <SelectTrigger class="h-10 w-full"><SelectValue placeholder="Choisir une agence" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem v-for="a in agencesDestination" :key="a.id" :value="a.id">{{ a.nom }}</SelectItem>
                        </SelectContent>
                    </Select>
                    <p v-if="villeArriveeId && agencesDestination.length === 0" class="text-xs text-muted-foreground">
                        Aucune agence dans cette ville.
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
        </div>

        <!-- Barre d'actions fixe : hors de la zone qui défile. -->
        <div class="shrink-0 flex flex-wrap items-center justify-end gap-2 border-t bg-background px-6 py-3">
            <div v-if="recu" class="mr-auto min-w-0 text-sm">
                <p class="truncate font-semibold">Dernier courrier : {{ recu.numero_courrier }}</p>
                <p class="truncate text-muted-foreground">
                    {{ recu.destination }}
                    <span v-if="recu.destinataire_nom"> · {{ recu.destinataire_nom }}</span>
                </p>
            </div>
            <Button v-if="recu" variant="outline" :disabled="impressionTalon || enregistrement" @click="imprimerTalon">
                <LoaderCircle v-if="impressionTalon" class="animate-spin" />
                <Printer v-else />
                {{ impressionTalon ? 'Impression talon…' : 'Imprimer talon' }}
            </Button>
            <Button variant="outline" @click="() => { void nettoyerCachePdfCourrier(); emit('fermer'); }">Fermer</Button>
            <Button :disabled="!peutEnvoyer" @click="ouvrirConfirmation">
                <LoaderCircle v-if="enregistrement" class="animate-spin" />
                <Send v-else />
                {{ enregistrement ? 'Impression en cours…' : 'Enregistrer et imprimer' }}
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
                    <Button variant="outline" @click="fermerConfirmation">
                        <X />
                        Fermer
                    </Button>
                    <Button :disabled="enregistrement" @click="envoyer">
                        <LoaderCircle v-if="enregistrement" class="animate-spin" />
                        <Check v-else />
                        {{ enregistrement ? 'Impression…' : 'Confirmer' }}
                    </Button>
                </div>
            </div>
        </div>
    </div>

    <div class="zone-impression hidden print:block">
        <CourrierRecu v-if="recu" :recu="recu" :partie="partieImpression" />
    </div>
</template>
