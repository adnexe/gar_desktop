<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { CalendarDays, Monitor, Power, Printer, RefreshCw, Server, Wifi } from '@lucide/vue';
import AppSidebarLayout from '@/Layouts/app/AppSidebarLayout.vue';
import { Button } from '@/Components/ui/button';
import { Input } from '@/Components/ui/input';
import { Label } from '@/Components/ui/label';
import { useConfigStore } from '@/Stores/config';
import { useSessionStore } from '@/Stores/session';

type ModeReseau = 'autonome' | 'serveur' | 'client';
type StatutConnexion = 'connecte' | 'deconnecte' | 'verification';
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
const portServeur = ref(3750);
const serveurUrl = ref('');
const secretReseau = ref('');
const enCours = ref(false);
const actualisation = ref(false);
const chargementImprimantes = ref(false);
const testImpression = ref(false);
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
    await Promise.all([chargerReseau(), chargerImprimantes(), config.charger()]);
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

async function executer(action: () => Promise<void>) {
    enCours.value = true;
    erreur.value = '';
    message.value = '';

    try {
        await action();
    } catch (e) {
        erreur.value = messageErreur(e, 'Action réseau impossible.');
    } finally {
        enCours.value = false;
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
        statutConnexion.value = 'connecte';
        message.value = 'Cette machine est maintenant la caisse serveur locale.';
    });
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
    });
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
    });
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
    });
}

async function actualiserVoyagesTicketsDepuisCaisse() {
    if (!config.agence || !clientOn.value) return;

    await executer(async () => {
        const resultat = await window.api.config.actualiserVoyagesServeurLocal(config.agence!.id);
        message.value = resultat.message;
    });
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
</script>

<template>
    <AppSidebarLayout titre="Paramètres">
        <div class="mx-auto max-w-5xl space-y-5">
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
                    <table v-if="imprimantes.length > 0" class="w-full text-sm">
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
                    <p v-else class="bg-muted/30 px-4 py-5 text-sm text-muted-foreground">
                        L’application ne voit pas encore d’imprimante. Vérifiez l’installation système, allumez l’imprimante, puis actualisez.
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
                        <p class="mt-1 text-sm text-muted-foreground">Les postes clients demandent ici les tickets et voyages.</p>
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
                        <p class="mt-1 text-sm text-muted-foreground">Elle lit les tickets/voyages de la caisse serveur.</p>
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
                            <p class="text-sm text-muted-foreground">Seul un super admin peut changer le rôle réseau de cette machine.</p>
                        </div>
                        <span :class="badgeEtat(reseauLocalOn)">
                            Réseau local {{ reseauLocalOn ? 'ON' : 'OFF' }}
                        </span>
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
                            <p class="text-sm text-muted-foreground">Cette machine ouvre l’accès local aux voyages et aux tickets.</p>
                        </div>
                    </div>

                    <div class="space-y-1.5">
                        <Label for="port-serveur">Port</Label>
                        <Input id="port-serveur" v-model.number="portServeur" type="number" min="1" class="h-10" />
                    </div>

                    <Button type="button" class="w-full" :disabled="enCours" @click="activerServeurLocal">
                        <Power class="size-4" />
                        Activer comme serveur
                    </Button>

                    <div v-if="reseau?.mode === 'serveur'" class="space-y-2 rounded-md border bg-background p-3 text-sm">
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
                            <p class="text-sm text-muted-foreground">Ce poste demande les tickets et voyages à la caisse serveur.</p>
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
                            Tester
                        </Button>
                        <Button type="button" :disabled="enCours || !serveurUrl || !secretReseau" @click="activerClientLocal">
                            Utiliser
                        </Button>
                        <Button type="button" variant="outline" :disabled="enCours || !clientOn" @click="actualiserVoyagesTicketsDepuisCaisse">
                            <RefreshCw :class="['size-4', enCours ? 'icone-tourne text-primary' : '']" />
                            Actualiser
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
                        Activer hors réseau local
                    </Button>
                </div>

                <div v-if="!estSuperAdmin && clientOn" class="flex flex-col gap-3 rounded-lg border bg-muted/20 p-4 md:flex-row md:items-center md:justify-between">
                    <div class="min-w-0">
                        <p class="font-semibold">Données caisse serveur</p>
                        <p class="truncate text-sm text-muted-foreground">{{ serveurUrl || 'Adresse serveur non définie' }}</p>
                    </div>
                    <Button type="button" variant="outline" :disabled="enCours" @click="actualiserVoyagesTicketsDepuisCaisse">
                        <RefreshCw :class="['size-4', enCours ? 'icone-tourne text-primary' : '']" />
                        Actualiser voyages/tickets
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
