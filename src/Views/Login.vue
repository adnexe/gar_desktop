<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { LogIn, RefreshCw } from '@lucide/vue';
import { Button } from '@/Components/ui/button';
import { Input } from '@/Components/ui/input';
import { Label } from '@/Components/ui/label';
import { useConfigStore } from '@/Stores/config';
import { useSessionStore } from '@/Stores/session';

const identifiant = ref('');
const motDePasse = ref('');
const enCours = ref(false);
const erreur = ref('');

const actualisation = ref(false);
const messageActualisation = ref('');

const config = useConfigStore();
const session = useSessionStore();
const router = useRouter();

// Chaque démarrage passe par cet écran : on rafraîchit le catalogue
// (accès, tarifs, trajets...) en silence si le serveur est joignable.
onMounted(() => {
    initialiser();
});

async function initialiser() {
    await actualiser(true);
    await verifierLicence();
}

async function actualiser(silencieux = false) {
    actualisation.value = true;
    if (!silencieux) messageActualisation.value = '';

    const resultat = await window.api.config.actualiser();

    actualisation.value = false;

    if (resultat.ok) {
        messageActualisation.value = 'Données mises à jour depuis le serveur.';
        // Le nom/la ville de l'agence ont pu changer côté admin.
        await config.charger();
    } else if (!silencieux) {
        messageActualisation.value = "Serveur injoignable — l'app utilise les données locales.";
    }
}

async function verifierLicence() {
    if (!config.agence) return;

    try {
        await config.reclamerLicence(config.agence.reference, 'poste-caisse');
        if (!config.licenceValide) {
            router.replace({ name: 'licence' });
        }
    } catch {
        // Hors-ligne : on garde la licence locale, le poste ne doit pas être
        // bloqué si le serveur est temporairement inaccessible.
    }
}

async function connecter() {
    enCours.value = true;
    erreur.value = '';

    try {
        const donnees = await window.api.auth.connecter(identifiant.value.trim(), motDePasse.value);
        session.definir(donnees);
        router.push({ name: 'dashboard' });
    } catch (e) {
        erreur.value = messageErreur(e, 'Téléphone/email ou mot de passe incorrect.');
    } finally {
        enCours.value = false;
    }
}

function messageErreur(e: unknown, defaut: string) {
    if (!(e instanceof Error)) return defaut;

    const message = e.message
        .replace(/^Error invoking remote method '[^']+': Error: /, '')
        .replace(/^Error invoking remote method "[^"]+": Error: /, '');

    return message && message !== 'IDENTIFIANTS_INVALIDES' ? message : defaut;
}

</script>

<template>
    <div class="flex min-h-screen items-center justify-center overflow-y-auto bg-muted/30 p-4">
        <form class="w-full max-w-md space-y-4 rounded-xl border bg-background p-8 shadow-sm" @submit.prevent="connecter">
            <div class="flex flex-col items-center gap-2 text-center">
                <LogIn class="size-8 text-muted-foreground" />
                <h1 class="text-lg font-semibold">Connexion</h1>
                <p v-if="config.agence" class="text-sm text-muted-foreground">{{ config.agence.nom }} — {{ config.agence.ville_nom }}</p>
            </div>

            <div class="space-y-1.5">
                <Label for="identifiant">Téléphone ou email</Label>
                <Input id="identifiant" v-model="identifiant" class="h-10 text-base" autofocus />
            </div>
            <div class="space-y-1.5">
                <Label for="password">Mot de passe</Label>
                <Input id="password" v-model="motDePasse" type="password" class="h-10 text-base" />
            </div>

            <p v-if="erreur" class="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{{ erreur }}</p>

            <Button type="submit" class="h-10 w-full" :disabled="enCours || !identifiant || !motDePasse">
                {{ enCours ? 'Connexion…' : 'Se connecter' }}
            </Button>

            <div class="space-y-2 border-t pt-3">
                <Button type="button" variant="outline" class="w-full" :disabled="actualisation" @click="actualiser(false)">
                    <RefreshCw :class="['size-4', actualisation ? 'animate-spin' : '']" />
                    {{ actualisation ? 'Actualisation…' : 'Actualiser les données' }}
                </Button>
                <p v-if="messageActualisation" class="text-center text-xs text-muted-foreground">
                    {{ messageActualisation }}
                </p>
            </div>

        </form>
    </div>
</template>
