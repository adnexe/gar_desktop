<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { CalendarDays, Globe, LoaderCircle, Monitor, Power, Printer, RefreshCw, Save, Server, SlidersHorizontal, TriangleAlert, Trash2, Wifi } from '@lucide/vue';
import AppSidebarLayout from '@/Layouts/app/AppSidebarLayout.vue';
import { Button } from '@/Components/ui/button';
import { Input } from '@/Components/ui/input';
import { Label } from '@/Components/ui/label';
import { useConfigStore } from '@/Stores/config';
import { useSessionStore } from '@/Stores/session';
import { appliquerCalibrationImpression, CALIBRATION_IMPRESSION_DEFAUT, normaliserCalibrationImpression, type CalibrationImpression } from '@/lib/calibrationImpression';

type ModeReseau = 'autonome' | 'serveur' | 'client';
type StatutConnexion = 'connecte' | 'deconnecte' | 'verification';
type ActionReseau =
    | 'activer_serveur'
    | 'relancer_serveur'
    | 'activer_client'
    | 'tester_client'
    | 'reconnecter_client'
    | 'desactiver'
    | 'actualiser_voyages';
type ReseauLocal = {
    mode: ModeReseau;
    serveurUrl: string | null;
    port: number;
    secret: string | null;
    actif: boolean;
    adresses: string[];
    agence: string | null;
};
type ImprimanteLocale = {
    name: string;
    displayName: string;
    description: string;
    isDefault: boolean;
    status: number | null;
};

const config = useConfigStore();
const session = useSessionStore();
const reseau = ref<ReseauLocal | null>(null);
const roleMachine = ref<ModeReseau>('client');
const imprimantes = ref<ImprimanteLocale[]>([]);
const calibrationImpression = ref<CalibrationImpression>({ ...CALIBRATION_IMPRESSION_DEFAUT });
const portServeur = ref(3750);
const serveurUrl = ref('');
const secretReseau = ref('');
const enCours = ref(false);
const actionReseau = ref<ActionReseau | null>(null);
const actualisation = ref(false);
const chargementImprimantes = ref(false);
const testImpression = ref(false);
const sauvegardeCalibration = ref(false);
const nettoyageDonnees = ref(false);
const resetEnCours = ref(false);
const synchroEnCours = ref(false);
const adminUrl = ref('');
const adresseAdminEnregistree = ref('');
const chargementAdresseAdmin = ref(true);
const sauvegardeAdresseAdmin = ref(false);
const erreurAdresseAdmin = ref('');
const messageAdresseAdmin = ref('');

async function chargerAdresseAdmin() {
    try {
        adminUrl.value = adresseAdminEnregistree.value = await window.api.config.adresseAdmin();
    } catch (e) {
        erreurAdresseAdmin.value = messageErreur(e, 'Impossible de lire l’adresse admin.');
    } finally {
        chargementAdresseAdmin.value = false;
    }
}

async function enregistrerAdresseAdmin() {
    if (!estSuperAdmin.value || sauvegardeAdresseAdmin.value || !adminUrl.value.trim()) return;
    sauvegardeAdresseAdmin.value = true;
    erreurAdresseAdmin.value = '';
    messageAdresseAdmin.value = '';
    try {
        const url = await window.api.config.enregistrerAdresseAdmin(adminUrl.value);
        adminUrl.value = adresseAdminEnregistree.value = url;
        messageAdresseAdmin.value = 'Adresse admin enregistrée sur ce poste.';
    } catch (e) {
        erreurAdresseAdmin.value = messageErreur(e, 'Adresse non modifiée. Vérifiez le lien et Internet.');
    } finally {
        sauvegardeAdresseAdmin.value = false;
    }
}

// --- Envois refusés par admin -------------------------------------------
// Une opération que le serveur refuse pour de bon quitte la file de synchro :
// le compteur « en attente » retombe à zéro alors que l'encaissement, lui, est
// bien dans la caisse. Sans cette liste, l'écart ne se voit qu'au pointage.
type EnvoiRefuse = {
    id: number;
    entite: string;
    libelle: string;
    numero: string | null;
    montant: number | null;
    enregistreLe: string;
    tentatives: number;
    message: string;
};

const envoisRefuses = ref<EnvoiRefuse[]>([]);
const relanceEnCours = ref(false);
const montantRefuse = computed(() => envoisRefuses.value.reduce((somme, envoi) => somme + (envoi.montant ?? 0), 0));
const formatMontantRefuse = (montant: number) => new Intl.NumberFormat('fr-FR').format(Math.round(montant)) + ' FCFA';

async function chargerEnvoisRefuses() {
    try {
        const resultat = await window.api.config.envoisRefuses();
        envoisRefuses.value = resultat.operations;
    } catch {
        // Lecture locale : un échec ici ne doit pas casser l'écran Paramètres.
        envoisRefuses.value = [];
    }
}

async function relancerEnvois(id?: number) {
    relanceEnCours.value = true;
    erreur.value = '';
    message.value = '';

    try {
        const resultat = await window.api.config.relancerEnvoisRefuses(id ?? null);
        await chargerEnvoisRefuses();

        message.value = resultat.restants > 0
            ? `${resultat.restants} envoi(s) toujours refusé(s) par admin.`
            : 'Tout est remonté à admin.';
    } catch (e) {
        erreur.value = messageErreur(e, 'Impossible de relancer les envois refusés.');
    } finally {
        relanceEnCours.value = false;
    }
}
const message = ref('');
const erreur = ref('');
const messageImpression = ref('');
const erreurImpression = ref('');
const statutConnexion = ref<StatutConnexion>('deconnecte');
const estSuperAdmin = computed(() => session.role === 'super_admin');

const libelleMode = computed(() => {
    if (reseau.value?.mode === 'serveur') return 'Caisse serveur';
    if (reseau.value?.mode === 'client') return 'Poste client';

    return 'Autonome';
});
const serveurOn = computed(() => reseau.value?.mode === 'serveur' && reseau.value.actif);
const clientOn = computed(() => reseau.value?.mode === 'client');
const serveurConnecte = computed(() => serveurOn.value);
const clientConnecte = computed(() => clientOn.value && statutConnexion.value === 'connecte');
const reseauConnecte = computed(() => serveurConnecte.value || clientConnecte.value);
const autonomeOn = computed(() => !serveurOn.value && !clientOn.value);
const reseauLocalOn = computed(() => serveurOn.value || clientOn.value);
const libelleConnexion = computed(() => {
    if (statutConnexion.value === 'verification') return 'Vérification...';
    return reseauConnecte.value ? 'Connecté' : 'Non connecté';
});
const libelleClient = computed(() => {
    if (clientOn.value && statutConnexion.value === 'verification') return 'Vérification...';
    if (clientConnecte.value) return 'Connecté';
    if (clientOn.value) return 'Connexion perdue';

    return 'Non connecté';
});
const joursAbonnementRestants = computed(() => {
    if (!config.licence?.date_expiration) return null;

    return differenceEnJours(dateDuJourIso(), config.licence.date_expiration);
});
const etatAbonnement = computed(() => {
    if (!config.licence) return 'aucune';
    if (!config.licence.actif || config.licence.statut === 'desactivee') return 'desactive';
    if (config.licence.statut === 'expiree' || (joursAbonnementRestants.value ?? -1) < 0) return 'expire';
    if ((joursAbonnementRestants.value ?? 99) <= 7) return 'bientot';

    return 'actif';
});
const libelleAbonnement = computed(() => {
    if (etatAbonnement.value === 'aucune') return 'Aucune licence';
    if (etatAbonnement.value === 'desactive') return 'Désactivé';
    if (etatAbonnement.value === 'expire') return 'Expiré';
    if (etatAbonnement.value === 'bientot') return joursAbonnementRestants.value === 0 ? "Expire aujourd'hui" : 'Expire bientôt';

    return 'Actif';
});
const detailAbonnement = computed(() => {
    if (!config.licence) return "Aucune licence locale n'est enregistrée sur ce poste.";
    if (etatAbonnement.value === 'desactive') return "Cette licence est désactivée côté admin.";

    const jours = joursAbonnementRestants.value;
    if (jours === null || Number.isNaN(jours)) return 'Période de licence non définie.';
    if (jours < 0) return `Abonnement expiré depuis ${Math.abs(jours)} jour${Math.abs(jours) > 1 ? 's' : ''}.`;
    if (jours === 0) return "L'abonnement prend fin aujourd'hui.";
    if (jours === 1) return "L'abonnement prend fin demain.";

    return `L'abonnement prend fin dans ${jours.toLocaleString('fr-FR')} jours.`;
});
const resumeAbonnement = computed(() => {
    if (!config.licence) return 'Non défini';

    const jours = joursAbonnementRestants.value;
    if (jours === null || Number.isNaN(jours)) return 'Non défini';
    if (jours < 0) return `-${Math.abs(jours).toLocaleString('fr-FR')} j`;
    if (jours === 0) return "Aujourd'hui";

    return `${jours.toLocaleString('fr-FR')} j`;
});

const chargementReseau = (action: ActionReseau) => actionReseau.value === action;

function badgeEtat(on: boolean) {
    return [
        'rounded-md px-2.5 py-1 text-xs font-semibold',
        on ? 'bg-sky-100 text-sky-700' : 'bg-muted text-muted-foreground',
    ];
}

function badgeAbonnement() {
    return [
        'rounded-md px-2.5 py-1 text-xs font-semibold',
        etatAbonnement.value === 'actif'
            ? 'bg-emerald-100 text-emerald-700'
            : etatAbonnement.value === 'bientot'
                ? 'bg-amber-100 text-amber-700'
                : etatAbonnement.value === 'expire'
                    ? 'bg-red-100 text-red-700'
                    : 'bg-muted text-muted-foreground',
    ];
}

function dateDuJourIso() {
    const maintenant = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');

    return `${maintenant.getFullYear()}-${pad(maintenant.getMonth() + 1)}-${pad(maintenant.getDate())}`;
}

function dateVersUtc(date: string) {
    const [annee, mois, jour] = date.slice(0, 10).split('-').map(Number);

    return Date.UTC(annee, mois - 1, jour);
}

function differenceEnJours(debut: string, fin: string) {
    return Math.floor((dateVersUtc(fin) - dateVersUtc(debut)) / 86_400_000);
}

function formatDate(date: string | null | undefined) {
    if (!date) return 'Non définie';

    const [annee, mois, jour] = date.slice(0, 10).split('-').map(Number);
    if (!annee || !mois || !jour) return date;

    return new Intl.DateTimeFormat('fr-FR').format(new Date(annee, mois - 1, jour));
}

function messageErreur(e: unknown, defaut: string) {
    if (!(e instanceof Error)) return defaut;

    return e.message
        .replace(/^Error invoking remote method '[^']+': Error: /, '')
        .replace(/^Error invoking remote method "[^"]+": Error: /, '');
}

function badgeConnexion(etat: StatutConnexion, connecte: boolean) {
    return [
        'rounded-md px-2.5 py-1 text-xs font-semibold',
        etat === 'verification'
            ? 'bg-amber-100 text-amber-700'
            : connecte
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-red-100 text-red-700',
    ];
}

function attendre(ms: number) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

onMounted(() => {
    void initialiser();
});

async function initialiser() {
    await Promise.all([chargerReseau(), chargerImprimantes(), chargerCalibrationImpression(), chargerEnvoisRefuses(), config.charger(), chargerAdresseAdmin()]);
}

async function chargerCalibrationImpression() {
    try {
        const calibration = await window.api.config.calibrationImpression();
        calibrationImpression.value = appliquerCalibrationImpression(calibration);
    } catch (e) {
        calibrationImpression.value = appliquerCalibrationImpression(CALIBRATION_IMPRESSION_DEFAUT);
        erreurImpression.value = messageErreur(e, 'Impossible de charger la calibration impression.');
    }
}

async function chargerReseau() {
    actualisation.value = true;
    erreur.value = '';
    const debut = Date.now();

    try {
        reseau.value = await window.api.config.reseauLocal();
        roleMachine.value = reseau.value.mode;
        portServeur.value = reseau.value.port;
        serveurUrl.value = reseau.value.serveurUrl ?? '';
        secretReseau.value = reseau.value.secret ?? '';
        await verifierConnexionLocale();
    } catch (e) {
        statutConnexion.value = 'deconnecte';
        erreur.value = messageErreur(e, "Impossible d'actualiser l'état réseau.");
    } finally {
        const restant = 700 - (Date.now() - debut);
        if (restant > 0) {
            await attendre(restant);
        }
        actualisation.value = false;
    }
}

async function verifierConnexionLocale() {
    if (serveurOn.value) {
        statutConnexion.value = 'connecte';
        return;
    }

    if (!clientOn.value || !serveurUrl.value || !secretReseau.value) {
        statutConnexion.value = 'deconnecte';
        return;
    }

    statutConnexion.value = 'verification';
    const resultat = await window.api.config.testerReseauLocal(serveurUrl.value, secretReseau.value);
    statutConnexion.value = resultat.ok ? 'connecte' : 'deconnecte';
}

async function executer(action: () => Promise<void>, actionKey: ActionReseau) {
    enCours.value = true;
    actionReseau.value = actionKey;
    erreur.value = '';
    message.value = '';

    try {
        await action();
    } catch (e) {
        erreur.value = messageErreur(e, 'Action réseau impossible.');
    } finally {
        enCours.value = false;
        actionReseau.value = null;
    }
}

async function activerServeurLocal() {
    if (!estSuperAdmin.value || !session.userId) {
        erreur.value = 'Seul un super admin peut modifier le rôle réseau de cette machine.';
        return;
    }

    await executer(async () => {
        reseau.value = await window.api.config.configurerReseauLocal({ mode: 'serveur', port: portServeur.value, acteurUserId: session.userId });
        roleMachine.value = reseau.value.mode;
        secretReseau.value = reseau.value.secret ?? '';
        statutConnexion.value = reseau.value.actif ? 'connecte' : 'deconnecte';
        message.value = 'Cette machine est maintenant la caisse serveur locale.';
    }, 'activer_serveur');
}

async function relancerServeurLocal() {
    if (reseau.value?.mode !== 'serveur') {
        erreur.value = "Cette machine n'est pas configurée comme caisse serveur.";
        return;
    }

    await executer(async () => {
        reseau.value = await window.api.config.relancerServeurLocal();
        roleMachine.value = reseau.value.mode;
        portServeur.value = reseau.value.port;
        secretReseau.value = reseau.value.secret ?? '';
        statutConnexion.value = reseau.value.actif ? 'connecte' : 'deconnecte';
        message.value = reseau.value.actif
            ? 'Serveur local relancé. Les postes clients peuvent se reconnecter.'
            : "Le serveur local n'a pas démarré.";
    }, 'relancer_serveur');
}

async function activerClientLocal() {
    if (!estSuperAdmin.value || !session.userId) {
        erreur.value = 'Seul un super admin peut modifier le rôle réseau de cette machine.';
        return;
    }

    await executer(async () => {
        reseau.value = await window.api.config.configurerReseauLocal({
            mode: 'client',
            serveurUrl: serveurUrl.value,
            secret: secretReseau.value,
            acteurUserId: session.userId,
        });
        roleMachine.value = reseau.value.mode;
        await verifierConnexionLocale();
        message.value = 'Ce poste utilise maintenant la caisse serveur locale.';
    }, 'activer_client');
}

async function testerClientLocal() {
    await executer(async () => {
        const resultat = await window.api.config.testerReseauLocal(serveurUrl.value, secretReseau.value);
        if (!resultat.ok) {
            statutConnexion.value = 'deconnecte';
            throw new Error(resultat.message);
        }

        statutConnexion.value = 'connecte';
        message.value = resultat.agence
            ? `${resultat.message} Agence : ${resultat.agence}.`
            : resultat.message;
    }, 'tester_client');
}

async function reconnecterClientLocal() {
    if (!clientOn.value || !serveurUrl.value || !secretReseau.value) {
        erreur.value = "Ce poste client n'a pas encore de paramètres serveur enregistrés.";
        return;
    }

    await executer(async () => {
        statutConnexion.value = 'verification';
        const test = await window.api.config.testerReseauLocal(serveurUrl.value, secretReseau.value);
        if (!test.ok) {
            statutConnexion.value = 'deconnecte';
            throw new Error(test.message);
        }

        statutConnexion.value = 'connecte';
        if (config.agence) {
            const resultat = await window.api.config.actualiserVoyagesServeurLocal(config.agence.id);
            message.value = `${test.message} ${resultat.message}`;
        } else {
            message.value = test.agence
                ? `${test.message} Agence : ${test.agence}.`
                : test.message;
        }
    }, 'reconnecter_client');
}

async function desactiverReseauLocal() {
    if (!estSuperAdmin.value || !session.userId) {
        erreur.value = 'Seul un super admin peut modifier le rôle réseau de cette machine.';
        return;
    }

    await executer(async () => {
        const etaitClient = clientOn.value;
        reseau.value = await window.api.config.configurerReseauLocal({ mode: 'autonome', acteurUserId: session.userId });
        roleMachine.value = reseau.value.mode;
        serveurUrl.value = reseau.value.serveurUrl ?? '';
        secretReseau.value = reseau.value.secret ?? '';
        statutConnexion.value = 'deconnecte';
        message.value = etaitClient
            ? 'Ce poste est déconnecté de la caisse serveur locale.'
            : 'Mode autonome activé.';
    }, 'desactiver');
}

async function actualiserVoyagesDepuisCaisse() {
    if (!config.agence || !clientOn.value) return;

    await executer(async () => {
        const resultat = await window.api.config.actualiserVoyagesServeurLocal(config.agence!.id);
        message.value = resultat.message;
    }, 'actualiser_voyages');
}

async function chargerImprimantes() {
    chargementImprimantes.value = true;
    erreurImpression.value = '';

    try {
        imprimantes.value = await window.api.impression.listerImprimantes();
    } catch (e) {
        imprimantes.value = [];
        erreurImpression.value = messageErreur(e, 'Impossible de lister les imprimantes.');
    } finally {
        chargementImprimantes.value = false;
    }
}

async function testerImpression() {
    testImpression.value = true;
    messageImpression.value = '';
    erreurImpression.value = '';

    try {
        const resultat = await window.api.impression.tester();
        if (!resultat.ok) {
            erreurImpression.value = resultat.erreur ?? "L'impression test n'a pas été confirmée.";
            return;
        }

        messageImpression.value = resultat.imprimante
            ? `Ticket test envoyé sur ${resultat.imprimante}.`
            : 'Ticket test envoyé.';
        await chargerImprimantes();
    } catch (e) {
        erreurImpression.value = messageErreur(e, "Impossible de lancer l'impression test.");
    } finally {
        testImpression.value = false;
    }
}

async function enregistrerCalibration() {
    sauvegardeCalibration.value = true;
    messageImpression.value = '';
    erreurImpression.value = '';

    try {
        const calibration = normaliserCalibrationImpression(calibrationImpression.value);
        const enregistree = await window.api.config.enregistrerCalibrationImpression(calibration);
        calibrationImpression.value = appliquerCalibrationImpression(enregistree);
        messageImpression.value = 'Calibration enregistrée sur cette machine.';
    } catch (e) {
        erreurImpression.value = messageErreur(e, "Impossible d'enregistrer la calibration.");
    } finally {
        sauvegardeCalibration.value = false;
    }
}

async function testerCalibration() {
    await enregistrerCalibration();
    if (erreurImpression.value) return;

    await testerImpression();
}

async function nettoyerDonneesTest() {
    if (!estSuperAdmin.value || !session.userId) {
        erreur.value = 'Seul un super admin peut nettoyer les données de cette machine.';
        return;
    }

    const confirmer = window.confirm(
        'Supprimer les données de test de cette machine ? Les voyages, tickets, bagages, courriers, clients et éléments en attente de synchronisation seront supprimés. La licence, la configuration, les agents, les utilisateurs et le catalogue seront conservés.',
    );
    if (!confirmer) return;

    nettoyageDonnees.value = true;
    erreur.value = '';
    message.value = '';

    try {
        const resultat = await window.api.config.nettoyerDonneesTest(session.userId);
        const total = Object.values(resultat.suppressions).reduce((somme, valeur) => somme + valeur, 0);
        message.value = `${resultat.message} ${total.toLocaleString('fr-FR')} ligne${total > 1 ? 's' : ''} supprimée${total > 1 ? 's' : ''}.`;
        await chargerReseau();
    } catch (e) {
        erreur.value = messageErreur(e, 'Impossible de nettoyer les données de test.');
    } finally {
        nettoyageDonnees.value = false;
    }
}

// Force un cycle de synchro tout de suite au lieu d'attendre le déclenchement
// automatique (toutes les 30s s'il y a des éléments en attente) — utile après
// une coupure réseau, ou pour vérifier que la file n'est pas bloquée.
async function synchroniserMaintenant() {
    synchroEnCours.value = true;
    erreur.value = '';
    message.value = '';
    const debut = Date.now();

    try {
        const resultat = await window.api.config.synchroniserMaintenant();
        await chargerEnvoisRefuses();
        if (resultat.enAttente === 0) {
            message.value = 'Synchronisation à jour : tout a été envoyé à admin.';
        } else if (resultat.erreur) {
            message.value = `${resultat.enAttente} élément(s) encore en attente.`;
            erreur.value = `Ça bloque sur un(e) ${resultat.erreur.entite} : ${resultat.erreur.derniere_erreur ?? 'erreur inconnue'} (${resultat.erreur.tentatives} tentative(s)).`;
        } else {
            message.value = `${resultat.enAttente} élément(s) encore en attente, ça devrait continuer tout seul.`;
        }
    } catch (e) {
        erreur.value = messageErreur(e, 'Impossible de lancer la synchronisation.');
    } finally {
        // Quand la caisse est hors-ligne ou que la file est vide, le cycle se
        // termine en quelques millisecondes : sans ce délai minimum, le
        // chargement clignote trop vite pour être visible.
        const ecoule = Date.now() - debut;
        if (ecoule < 500) {
            await new Promise((resolve) => setTimeout(resolve, 500 - ecoule));
        }
        synchroEnCours.value = false;
    }
}

// Contrairement au nettoyage ci-dessus, tout est effacé ici : licence,
// configuration, agents, catalogue... Le poste redevient comme neuf et
// redemande le numéro de gare + le numéro de poste. Purement local : ne
// touche pas à l'admin (une licence déjà assignée reste assignée là-bas).
async function resetComplet() {
    if (!estSuperAdmin.value || !session.userId) {
        erreur.value = 'Seul un super admin peut réinitialiser cette machine.';
        return;
    }

    const confirmer = window.confirm(
        'Réinitialiser complètement ce poste ? TOUT sera supprimé : configuration, licence, agents, utilisateurs, catalogue, voyages, ventes, et tout ce qui n\'a pas encore été synchronisé avec admin sera perdu. Le poste redémarrera comme neuf, en redemandant le numéro de gare et le numéro de poste. Cette action est irréversible.',
    );
    if (!confirmer) return;

    resetEnCours.value = true;
    erreur.value = '';
    message.value = '';

    try {
        await window.api.config.resetComplet(session.userId);
        // Rechargement complet : remet tous les stores (config, session...) à
        // zéro et laisse le garde de navigation rediriger vers /configuration
        // puisque le poste n'est plus configuré.
        window.location.reload();
    } catch (e) {
        erreur.value = messageErreur(e, 'Impossible de réinitialiser ce poste.');
        resetEnCours.value = false;
    }
}
</script>

<template>
    <AppSidebarLayout titre="Paramètres">
        <div class="mx-auto max-w-5xl space-y-5">
            <section class="border-b pb-5">
                <div class="mb-4 flex items-center gap-3">
                    <Globe class="size-5 shrink-0 text-sky-600" />
                    <h2 class="text-base font-semibold">Connexion à admin</h2>
                </div>
                <form v-if="estSuperAdmin" class="flex flex-col gap-3 sm:flex-row sm:items-end" @submit.prevent="enregistrerAdresseAdmin">
                    <div class="min-w-0 flex-1 space-y-1.5">
                        <Label for="param_admin_url">Adresse admin</Label>
                        <Input id="param_admin_url" v-model="adminUrl" type="url" required autocomplete="url" placeholder="https://admin.exemple.com" :disabled="chargementAdresseAdmin || sauvegardeAdresseAdmin" />
                    </div>
                    <Button type="submit" variant="outline" class="shrink-0" :disabled="chargementAdresseAdmin || sauvegardeAdresseAdmin || !adminUrl.trim() || adminUrl.trim() === adresseAdminEnregistree">
                        <LoaderCircle v-if="sauvegardeAdresseAdmin" class="size-4 animate-spin" />
                        <Save v-else class="size-4" />
                        {{ sauvegardeAdresseAdmin ? 'Vérification...' : 'Enregistrer' }}
                    </Button>
                </form>
                <p v-else class="break-all text-sm text-muted-foreground">{{ chargementAdresseAdmin ? 'Chargement...' : adresseAdminEnregistree }}</p>
                <p v-if="erreurAdresseAdmin" role="alert" class="mt-3 text-sm text-destructive">{{ erreurAdresseAdmin }}</p>
                <p v-if="messageAdresseAdmin" role="status" class="mt-3 text-sm text-emerald-700 dark:text-emerald-400">{{ messageAdresseAdmin }}</p>
            </section>
            <section class="rounded-lg border bg-card p-5 shadow-sm">
                <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                        <p class="text-sm text-muted-foreground">Réseau local gare</p>
                        <h1 class="mt-1 text-xl font-semibold">{{ libelleMode }}</h1>
                        <p v-if="reseau?.agence" class="mt-1 text-sm text-muted-foreground">{{ reseau.agence }}</p>
                    </div>

                    <div class="flex flex-wrap items-center gap-2">
                        <span :class="badgeConnexion(statutConnexion, reseauConnecte)">
                            {{ libelleConnexion }}
                        </span>
                        <span :class="badgeEtat(reseauLocalOn)">
                            Réseau local {{ reseauLocalOn ? 'ON' : 'OFF' }}
                        </span>
                        <span class="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                            Mode : {{ libelleMode }}
                        </span>
                        <Button type="button" variant="outline" :disabled="actualisation || enCours" @click="chargerReseau">
                            <RefreshCw :class="['size-4', actualisation ? 'icone-tourne text-primary' : '']" />
                            {{ actualisation ? 'Vérification...' : 'Actualiser' }}
                        </Button>
                    </div>
                </div>
            </section>

            <section class="rounded-lg border bg-card p-5 shadow-sm">
                <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div class="flex min-w-0 items-start gap-3">
                        <div class="rounded-md bg-muted p-2">
                            <CalendarDays class="size-5 text-muted-foreground" />
                        </div>
                        <div class="min-w-0">
                            <div class="flex flex-wrap items-center gap-2">
                                <h2 class="text-base font-semibold">Abonnement</h2>
                                <span :class="badgeAbonnement()">{{ libelleAbonnement }}</span>
                            </div>
                            <p class="mt-1 text-sm text-muted-foreground">{{ detailAbonnement }}</p>
                        </div>
                    </div>

                    <div class="grid gap-3 text-sm sm:grid-cols-3 lg:min-w-[30rem]">
                        <div class="rounded-md border bg-muted/20 p-3">
                            <p class="text-xs font-medium uppercase text-muted-foreground">Début</p>
                            <p class="mt-1 font-semibold">{{ formatDate(config.licence?.date_debut) }}</p>
                        </div>
                        <div class="rounded-md border bg-muted/20 p-3">
                            <p class="text-xs font-medium uppercase text-muted-foreground">Fin</p>
                            <p class="mt-1 font-semibold">{{ formatDate(config.licence?.date_expiration) }}</p>
                        </div>
                        <div class="rounded-md border bg-muted/20 p-3">
                            <p class="text-xs font-medium uppercase text-muted-foreground">Reste</p>
                            <p class="mt-1 font-semibold">{{ resumeAbonnement }}</p>
                            <p v-if="config.licence?.code" class="mt-1 truncate text-xs text-muted-foreground">
                                {{ config.licence.code }}
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            <section class="rounded-lg border bg-card p-5 shadow-sm">
                <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div class="flex min-w-0 items-start gap-3">
                        <div class="rounded-md bg-muted p-2">
                            <Printer class="size-5 text-muted-foreground" />
                        </div>
                        <div class="min-w-0">
                            <div class="flex flex-wrap items-center gap-2">
                                <h2 class="text-base font-semibold">Impression</h2>
                                <span :class="badgeEtat(imprimantes.length > 0)">
                                    {{ imprimantes.length > 0 ? 'Imprimante détectée' : 'Aucune imprimante détectée' }}
                                </span>
                            </div>
                            <p class="mt-1 text-sm text-muted-foreground">
                                Une vente est validée seulement quand l’impression est confirmée par le système.
                            </p>
                        </div>
                    </div>

                    <div class="flex flex-wrap gap-2">
                        <Button type="button" variant="outline" :disabled="chargementImprimantes || testImpression" @click="chargerImprimantes">
                            <RefreshCw :class="['size-4', chargementImprimantes ? 'icone-tourne text-primary' : '']" />
                            {{ chargementImprimantes ? 'Recherche...' : 'Actualiser imprimantes' }}
                        </Button>
                        <Button type="button" :disabled="testImpression" @click="testerImpression">
                            <Printer class="size-4" />
                            {{ testImpression ? 'Test en cours...' : 'Tester impression' }}
                        </Button>
                    </div>
                </div>

                <div class="mt-4 overflow-hidden rounded-md border">
                    <div v-if="imprimantes.length > 0" class="overflow-x-auto">
                    <table class="w-full text-sm">
                        <thead class="bg-muted/40 text-left text-muted-foreground">
                            <tr>
                                <th class="px-3 py-2 font-medium">Nom</th>
                                <th class="px-3 py-2 font-medium">Système</th>
                                <th class="px-3 py-2 font-medium">État</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="imprimante in imprimantes" :key="imprimante.name" class="border-t">
                                <td class="px-3 py-2 font-medium">
                                    {{ imprimante.displayName || imprimante.name }}
                                    <span v-if="imprimante.isDefault" class="ml-2 rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">Défaut</span>
                                </td>
                                <td class="px-3 py-2 text-muted-foreground">{{ imprimante.name }}</td>
                                <td class="px-3 py-2 text-muted-foreground">{{ imprimante.status ?? '—' }}</td>
                            </tr>
                        </tbody>
                    </table>
                    </div>
                    <p v-else class="bg-muted/30 px-4 py-5 text-sm text-muted-foreground">
                        L’application ne voit pas encore d’imprimante. Vérifiez l’installation système, allumez l’imprimante, puis actualisez.
                    </p>
                </div>

                <div class="mt-4 rounded-lg border bg-muted/20 p-4">
                    <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div class="flex items-start gap-3">
                            <div class="rounded-md bg-background p-2 shadow-sm">
                                <SlidersHorizontal class="size-5 text-primary" />
                            </div>
                            <div>
                                <h3 class="text-sm font-semibold">Calibration locale</h3>
                                <p class="mt-1 text-sm text-muted-foreground">
                                    Ajuste seulement cette machine si le reçu sort décalé ou coupé.
                                </p>
                            </div>
                        </div>

                        <div class="flex flex-wrap gap-2">
                            <Button type="button" variant="outline" :disabled="sauvegardeCalibration || testImpression" @click="enregistrerCalibration">
                                <LoaderCircle v-if="sauvegardeCalibration" class="size-4 animate-spin" />
                                {{ sauvegardeCalibration ? 'Enregistrement...' : 'Enregistrer' }}
                            </Button>
                            <Button type="button" :disabled="sauvegardeCalibration || testImpression" @click="testerCalibration">
                                <Printer v-if="!testImpression" class="size-4" />
                                <LoaderCircle v-else class="size-4 animate-spin" />
                                {{ testImpression ? 'Test...' : 'Tester calibration' }}
                            </Button>
                        </div>
                    </div>

                    <div class="mt-4 grid gap-4 md:grid-cols-3">
                        <div class="space-y-2">
                            <Label for="largeur-papier">Largeur papier PDF</Label>
                            <div class="flex items-center gap-2">
                                <Input id="largeur-papier" v-model.number="calibrationImpression.largeurPapierMm" type="number" min="57" max="90" step="0.5" />
                                <span class="text-sm text-muted-foreground">mm</span>
                            </div>
                        </div>
                        <div class="space-y-2">
                            <Label for="largeur-contenu">Largeur du contenu</Label>
                            <div class="flex items-center gap-2">
                                <Input id="largeur-contenu" v-model.number="calibrationImpression.largeurContenuMm" type="number" min="45" max="90" step="0.5" />
                                <span class="text-sm text-muted-foreground">mm</span>
                            </div>
                        </div>
                        <div class="space-y-2">
                            <Label for="decalage-x">Décalage horizontal</Label>
                            <div class="flex items-center gap-2">
                                <Input id="decalage-x" v-model.number="calibrationImpression.decalageXMm" type="number" min="-12" max="12" step="0.5" />
                                <span class="text-sm text-muted-foreground">mm</span>
                            </div>
                        </div>
                    </div>

                    <p class="mt-3 text-xs text-muted-foreground">
                        Valeur normale : papier 80mm, contenu 70mm, décalage 0mm. Si ça coupe à droite, baisse le contenu ou mets un décalage négatif.
                    </p>
                </div>

                <p v-if="messageImpression" class="mt-3 rounded-md bg-muted/50 px-4 py-3 text-sm text-muted-foreground">{{ messageImpression }}</p>
                <p v-if="erreurImpression" class="mt-3 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">{{ erreurImpression }}</p>
            </section>

            <section class="space-y-5 rounded-lg border bg-card p-5 shadow-sm">
                <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                        <p class="text-sm text-muted-foreground">Rôle de cette machine</p>
                        <h2 class="mt-1 text-base font-semibold">{{ libelleMode }}</h2>
                    </div>
                    <span :class="badgeConnexion(statutConnexion, reseauConnecte)">
                        {{ libelleConnexion }}
                    </span>
                </div>

                <div v-if="estSuperAdmin" class="grid gap-3 md:grid-cols-3">
                    <button
                        type="button"
                        :class="[
                            'rounded-lg border p-4 text-left transition',
                            roleMachine === 'serveur' ? 'border-primary bg-primary/5 shadow-sm' : 'bg-background hover:bg-muted/30',
                        ]"
                        @click="roleMachine = 'serveur'"
                    >
                        <div class="flex items-center justify-between gap-3">
                            <Server class="size-5 text-primary" />
                            <span :class="badgeEtat(serveurOn)">{{ serveurOn ? 'ON' : 'OFF' }}</span>
                        </div>
                        <p class="mt-3 font-semibold">Machine serveur</p>
                        <p class="mt-1 text-sm text-muted-foreground">Les postes clients récupèrent ici les voyages.</p>
                    </button>

                    <button
                        type="button"
                        :class="[
                            'rounded-lg border p-4 text-left transition',
                            roleMachine === 'client' ? 'border-primary bg-primary/5 shadow-sm' : 'bg-background hover:bg-muted/30',
                        ]"
                        @click="roleMachine = 'client'"
                    >
                        <div class="flex items-center justify-between gap-3">
                            <Wifi class="size-5 text-primary" />
                            <span :class="badgeConnexion(clientOn ? statutConnexion : 'deconnecte', clientConnecte)">{{ libelleClient }}</span>
                        </div>
                        <p class="mt-3 font-semibold">Machine cliente</p>
                        <p class="mt-1 text-sm text-muted-foreground">Elle lit les voyages de la caisse serveur.</p>
                    </button>

                    <button
                        type="button"
                        :class="[
                            'rounded-lg border p-4 text-left transition',
                            roleMachine === 'autonome' ? 'border-primary bg-primary/5 shadow-sm' : 'bg-background hover:bg-muted/30',
                        ]"
                        @click="roleMachine = 'autonome'"
                    >
                        <div class="flex items-center justify-between gap-3">
                            <Monitor class="size-5 text-primary" />
                            <span :class="badgeEtat(autonomeOn)">{{ autonomeOn ? 'ON' : 'OFF' }}</span>
                        </div>
                        <p class="mt-3 font-semibold">Hors réseau local</p>
                        <p class="mt-1 text-sm text-muted-foreground">Ce poste travaille sans caisse serveur locale.</p>
                    </button>
                </div>

                <div v-else class="rounded-lg border bg-muted/20 p-4">
                    <div class="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <p class="font-semibold">{{ libelleMode }}</p>
                            <p class="text-sm text-muted-foreground">
                                <template v-if="reseau?.mode === 'serveur'">
                                    Cette machine démarre le serveur local quand l'application est ouverte.
                                </template>
                                <template v-else-if="reseau?.mode === 'client'">
                                    Ce poste utilise les paramètres serveur enregistrés par le super admin.
                                </template>
                                <template v-else>
                                    Seul un super admin peut changer le rôle réseau de cette machine.
                                </template>
                            </p>
                        </div>
                        <span :class="badgeEtat(reseauLocalOn)">
                            Réseau local {{ reseauLocalOn ? 'ON' : 'OFF' }}
                        </span>
                    </div>
                    <div v-if="reseau?.mode === 'serveur'" class="mt-4 flex flex-wrap items-center gap-2">
                        <Button type="button" variant="outline" :disabled="enCours" @click="relancerServeurLocal">
                            <RefreshCw :class="['size-4', chargementReseau('relancer_serveur') ? 'icone-tourne text-primary' : '']" />
                            {{ chargementReseau('relancer_serveur') ? 'Relance...' : 'Relancer serveur local' }}
                        </Button>
                        <span :class="badgeConnexion(serveurOn ? 'connecte' : 'deconnecte', serveurConnecte)">
                            {{ serveurConnecte ? 'Serveur actif' : 'Serveur arrêté' }}
                        </span>
                    </div>
                    <div v-if="reseau?.mode === 'client'" class="mt-4 space-y-3 rounded-md border bg-background p-3">
                        <div class="flex flex-wrap items-center justify-between gap-3 text-sm">
                            <div class="min-w-0">
                                <p class="font-semibold">Connexion caisse serveur</p>
                                <p class="truncate text-muted-foreground">{{ serveurUrl || 'Adresse serveur non définie' }}</p>
                            </div>
                            <span :class="badgeConnexion(clientOn ? statutConnexion : 'deconnecte', clientConnecte)">
                                {{ libelleClient }}
                            </span>
                        </div>
                        <div class="flex flex-wrap items-center gap-2">
                            <Button type="button" variant="outline" :disabled="enCours || !serveurUrl || !secretReseau" @click="reconnecterClientLocal">
                                <RefreshCw :class="['size-4', chargementReseau('reconnecter_client') ? 'icone-tourne text-primary' : '']" />
                                {{ chargementReseau('reconnecter_client') ? 'Connexion...' : 'Reconnecter' }}
                            </Button>
                            <Button type="button" variant="outline" :disabled="enCours || !serveurUrl || !secretReseau" @click="testerClientLocal">
                                <RefreshCw :class="['size-4', chargementReseau('tester_client') ? 'icone-tourne text-primary' : '']" />
                                {{ chargementReseau('tester_client') ? 'Test...' : 'Tester' }}
                            </Button>
                        </div>
                    </div>
                </div>

                <div v-if="estSuperAdmin && roleMachine === 'serveur'" class="space-y-4 rounded-lg border bg-muted/20 p-4">
                    <div class="flex items-start gap-3">
                        <div class="rounded-md bg-background p-2">
                            <Server class="size-5 text-muted-foreground" />
                        </div>
                        <div class="min-w-0 flex-1">
                            <div class="flex items-center justify-between gap-3">
                                <h3 class="text-base font-semibold">Machine serveur</h3>
                                <span :class="badgeConnexion(serveurOn ? 'connecte' : 'deconnecte', serveurConnecte)">
                                    {{ serveurConnecte ? 'Connecté' : 'Non connecté' }}
                                </span>
                            </div>
                            <p class="text-sm text-muted-foreground">Cette machine ouvre l’accès local aux voyages.</p>
                        </div>
                    </div>

                    <div class="space-y-1.5">
                        <Label for="port-serveur">Port</Label>
                        <Input id="port-serveur" v-model.number="portServeur" type="number" min="1" class="h-10" />
                    </div>

                    <div class="grid gap-2 sm:grid-cols-2">
                        <Button type="button" :disabled="enCours" @click="activerServeurLocal">
                            <LoaderCircle v-if="chargementReseau('activer_serveur')" class="icone-tourne size-4" />
                            <Power v-else class="size-4" />
                            {{ chargementReseau('activer_serveur') ? 'Activation...' : 'Activer comme serveur' }}
                        </Button>
                        <Button type="button" variant="outline" :disabled="enCours || reseau?.mode !== 'serveur'" @click="relancerServeurLocal">
                            <RefreshCw :class="['size-4', chargementReseau('relancer_serveur') ? 'icone-tourne text-primary' : '']" />
                            {{ chargementReseau('relancer_serveur') ? 'Relance...' : 'Relancer serveur local' }}
                        </Button>
                    </div>

                    <div v-if="reseau?.mode === 'serveur'" class="space-y-2 rounded-md border bg-background p-3 text-sm">
                        <div class="flex items-center justify-between gap-3">
                            <span class="text-muted-foreground">État réel</span>
                            <span :class="badgeConnexion(serveurOn ? 'connecte' : 'deconnecte', serveurConnecte)">
                                {{ serveurConnecte ? 'Serveur démarré' : 'Serveur arrêté' }}
                            </span>
                        </div>
                        <div class="flex items-center justify-between gap-3">
                            <span class="text-muted-foreground">Code réseau</span>
                            <span class="font-mono font-semibold">{{ reseau.secret }}</span>
                        </div>
                        <div class="space-y-1">
                            <p class="text-muted-foreground">Adresses</p>
                            <p v-for="adresse in reseau.adresses" :key="adresse" class="break-all font-mono text-[0.85rem]">
                                {{ adresse }}
                            </p>
                        </div>
                    </div>
                </div>

                <div v-if="estSuperAdmin && roleMachine === 'client'" class="space-y-4 rounded-lg border bg-muted/20 p-4">
                    <div class="flex items-start gap-3">
                        <div class="rounded-md bg-background p-2">
                            <Wifi class="size-5 text-muted-foreground" />
                        </div>
                        <div class="min-w-0 flex-1">
                            <div class="flex items-center justify-between gap-3">
                                <h3 class="text-base font-semibold">Machine cliente</h3>
                                <span :class="badgeConnexion(clientOn ? statutConnexion : 'deconnecte', clientConnecte)">
                                    {{ libelleClient }}
                                </span>
                            </div>
                            <p class="text-sm text-muted-foreground">Ce poste demande les voyages à la caisse serveur.</p>
                        </div>
                    </div>

                    <div class="space-y-1.5">
                        <Label for="serveur-url">Adresse caisse serveur</Label>
                        <Input id="serveur-url" v-model="serveurUrl" placeholder="http://192.168.1.20:3750" class="h-10" />
                    </div>
                    <div class="space-y-1.5">
                        <Label for="secret-reseau">Code réseau</Label>
                        <Input id="secret-reseau" v-model="secretReseau" placeholder="Code affiché sur la caisse" class="h-10" />
                    </div>

                    <div class="grid gap-2 sm:grid-cols-3">
                        <Button type="button" variant="outline" :disabled="enCours || !serveurUrl || !secretReseau" @click="testerClientLocal">
                            <RefreshCw :class="['size-4', chargementReseau('tester_client') ? 'icone-tourne text-primary' : '']" />
                            {{ chargementReseau('tester_client') ? 'Test...' : 'Tester' }}
                        </Button>
                        <Button type="button" :disabled="enCours || !serveurUrl || !secretReseau" @click="activerClientLocal">
                            <LoaderCircle v-if="chargementReseau('activer_client')" class="icone-tourne size-4" />
                            <Wifi v-else class="size-4" />
                            {{ chargementReseau('activer_client') ? 'Connexion...' : 'Utiliser' }}
                        </Button>
                        <Button type="button" variant="outline" :disabled="enCours || !clientOn || !serveurUrl || !secretReseau" @click="reconnecterClientLocal">
                            <RefreshCw :class="['size-4', chargementReseau('reconnecter_client') ? 'icone-tourne text-primary' : '']" />
                            {{ chargementReseau('reconnecter_client') ? 'Connexion...' : 'Reconnecter' }}
                        </Button>
                    </div>
                </div>

                <div v-if="estSuperAdmin && roleMachine === 'autonome'" class="flex flex-col gap-3 rounded-lg border bg-muted/20 p-4 md:flex-row md:items-center md:justify-between">
                    <div class="flex items-start gap-3">
                        <div class="rounded-md bg-background p-2">
                            <Monitor class="size-5 text-muted-foreground" />
                        </div>
                        <div class="min-w-0 flex-1">
                            <div class="flex items-center gap-3">
                                <h3 class="text-base font-semibold">Hors réseau local</h3>
                                <span :class="badgeEtat(autonomeOn)">{{ autonomeOn ? 'ON' : 'OFF' }}</span>
                            </div>
                            <p class="text-sm text-muted-foreground">Ce poste garde sa base locale et continue la synchronisation admin quand internet est disponible.</p>
                        </div>
                    </div>
                    <Button type="button" variant="outline" :disabled="enCours" @click="desactiverReseauLocal">
                        <LoaderCircle v-if="chargementReseau('desactiver')" class="icone-tourne size-4" />
                        <Monitor v-else class="size-4" />
                        {{ chargementReseau('desactiver') ? 'Activation...' : 'Activer hors réseau local' }}
                    </Button>
                </div>

                <div v-if="!estSuperAdmin && clientOn" class="flex flex-col gap-3 rounded-lg border bg-muted/20 p-4 md:flex-row md:items-center md:justify-between">
                    <div class="min-w-0">
                        <p class="font-semibold">Données caisse serveur</p>
                        <p class="truncate text-sm text-muted-foreground">{{ serveurUrl || 'Adresse serveur non définie' }}</p>
                    </div>
                    <Button type="button" variant="outline" :disabled="enCours" @click="actualiserVoyagesDepuisCaisse">
                        <RefreshCw :class="['size-4', chargementReseau('actualiser_voyages') ? 'icone-tourne text-primary' : '']" />
                        {{ chargementReseau('actualiser_voyages') ? 'Actualisation...' : 'Actualiser voyages' }}
                    </Button>
                </div>
            </section>

            <section v-if="estSuperAdmin" class="rounded-lg border border-destructive/20 bg-card p-5 shadow-sm">
                <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div class="flex min-w-0 items-start gap-3">
                        <div class="rounded-md bg-destructive/10 p-2">
                            <Trash2 class="size-5 text-destructive" />
                        </div>
                        <div class="min-w-0">
                            <h2 class="text-base font-semibold">Nettoyage local</h2>
                            <p class="mt-1 text-sm text-muted-foreground">
                                Supprime les anciennes données de test de cette machine sans toucher à la licence, aux accès et au catalogue.
                            </p>
                        </div>
                    </div>

                    <Button type="button" variant="destructive" :disabled="nettoyageDonnees" @click="nettoyerDonneesTest">
                        <RefreshCw v-if="nettoyageDonnees" class="icone-tourne size-4" />
                        <Trash2 v-else class="size-4" />
                        {{ nettoyageDonnees ? 'Nettoyage...' : 'Nettoyer les données de test' }}
                    </Button>
                </div>

                <div class="mt-4 flex flex-col gap-4 border-t pt-4 md:flex-row md:items-center md:justify-between">
                    <div class="flex min-w-0 items-start gap-3">
                        <div class="rounded-md bg-muted p-2">
                            <RefreshCw class="size-5 text-foreground" />
                        </div>
                        <div class="min-w-0">
                            <h2 class="text-base font-semibold">Synchronisation</h2>
                            <p class="mt-1 text-sm text-muted-foreground">
                                Force l'envoi vers admin tout de suite au lieu d'attendre le déclenchement automatique — utile après une coupure réseau, ou pour vérifier que rien n'est bloqué.
                            </p>
                        </div>
                    </div>

                    <Button type="button" variant="outline" :disabled="synchroEnCours" @click="synchroniserMaintenant">
                        <RefreshCw :class="['size-4', synchroEnCours ? 'icone-tourne' : '']" />
                        {{ synchroEnCours ? 'Synchronisation...' : 'Synchroniser vers admin' }}
                    </Button>
                </div>

                <!-- Envois qu'admin a refusés pour de bon. Ils ont quitté la
                     file de synchro : sans ce bloc, l'encaissement resterait en
                     caisse sans jamais arriver en compta, et personne ne le
                     saurait avant le pointage. -->
                <div v-if="envoisRefuses.length" class="mt-4 border-t border-destructive/20 pt-4">
                    <div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                        <div class="flex min-w-0 items-start gap-3">
                            <div class="rounded-md bg-destructive/10 p-2">
                                <TriangleAlert class="size-5 text-destructive" />
                            </div>
                            <div class="min-w-0">
                                <h2 class="text-base font-semibold text-destructive">
                                    {{ envoisRefuses.length }} envoi(s) refusé(s) par admin
                                </h2>
                                <p class="mt-1 text-sm text-muted-foreground">
                                    <template v-if="montantRefuse > 0">
                                        {{ formatMontantRefuse(montantRefuse) }} encaissés au guichet qu'admin ne voit pas.
                                    </template>
                                    Corrigez la cause côté admin, puis relancez.
                                </p>
                            </div>
                        </div>

                        <Button type="button" variant="destructive" :disabled="relanceEnCours" @click="relancerEnvois()">
                            <RefreshCw :class="['size-4', relanceEnCours ? 'icone-tourne' : '']" />
                            {{ relanceEnCours ? 'Relance...' : 'Tout relancer' }}
                        </Button>
                    </div>

                    <ul class="mt-3 space-y-2">
                        <li
                            v-for="envoi in envoisRefuses"
                            :key="envoi.id"
                            class="rounded-md border bg-muted/30 p-3"
                        >
                            <div class="flex items-start justify-between gap-3">
                                <div class="min-w-0">
                                    <p class="truncate text-sm font-semibold">
                                        {{ envoi.libelle }}<span v-if="envoi.numero"> {{ envoi.numero }}</span>
                                    </p>
                                    <p class="text-xs text-muted-foreground">
                                        {{ envoi.tentatives }} tentative(s)
                                    </p>
                                </div>
                                <p v-if="envoi.montant !== null" class="shrink-0 text-sm font-semibold">
                                    {{ formatMontantRefuse(envoi.montant) }}
                                </p>
                            </div>
                            <p class="mt-1 text-xs text-destructive">{{ envoi.message }}</p>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                class="mt-2"
                                :disabled="relanceEnCours"
                                @click="relancerEnvois(envoi.id)"
                            >
                                Relancer
                            </Button>
                        </li>
                    </ul>
                </div>

                <div class="mt-4 flex flex-col gap-4 border-t border-destructive/20 pt-4 md:flex-row md:items-center md:justify-between">
                    <div class="flex min-w-0 items-start gap-3">
                        <div class="rounded-md bg-destructive/10 p-2">
                            <RefreshCw class="size-5 text-destructive" />
                        </div>
                        <div class="min-w-0">
                            <h2 class="text-base font-semibold">Réinitialisation complète</h2>
                            <p class="mt-1 text-sm text-muted-foreground">
                                Efface TOUT sur ce poste (configuration, licence, agents, catalogue, ventes...) et redemande le numéro de gare et de poste, comme à la première installation.
                            </p>
                        </div>
                    </div>

                    <Button type="button" variant="destructive" :disabled="resetEnCours" @click="resetComplet">
                        <RefreshCw v-if="resetEnCours" class="icone-tourne size-4" />
                        <RefreshCw v-else class="size-4" />
                        {{ resetEnCours ? 'Réinitialisation...' : 'Réinitialiser ce poste' }}
                    </Button>
                </div>
            </section>

            <p v-if="message" class="rounded-md bg-muted/50 px-4 py-3 text-sm text-muted-foreground">{{ message }}</p>
            <p v-if="erreur" class="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">{{ erreur }}</p>
        </div>
    </AppSidebarLayout>
</template>

<style scoped>
.icone-tourne {
    animation: rotation-continue 0.75s linear infinite;
}

@keyframes rotation-continue {
    from {
        transform: rotate(0deg);
    }

    to {
        transform: rotate(360deg);
    }
}
</style>
