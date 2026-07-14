<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { KeyRound, RefreshCw } from '@lucide/vue';
import { Button } from '@/Components/ui/button';
import { useConfigStore } from '@/Stores/config';

const config = useConfigStore();
const router = useRouter();

const enCours = ref(false);
const message = ref('');
const erreur = ref('');

const reference = computed(() => config.agence?.reference ?? '');

async function recuperer() {
    if (!reference.value) {
        erreur.value = "Référence agence introuvable sur ce poste.";
        return;
    }

    enCours.value = true;
    erreur.value = '';
    message.value = '';

    try {
        if (config.licenceValide) {
            message.value = 'Ce poste dispose déjà d’une licence active.';
            router.push({ name: 'connexion' });
            return;
        }

        const resultat = await config.reclamerLicence(reference.value, 'poste-caisse');

        if (!resultat.ok) {
            erreur.value = resultat.message || "Aucune licence disponible pour cette agence.";
            return;
        }

        message.value = resultat.message;
        await config.charger();
        router.push({ name: 'connexion' });
    } catch {
        erreur.value = "Impossible de contacter le serveur de licences.";
    } finally {
        enCours.value = false;
    }
}
</script>

<template>
    <div class="flex h-screen items-center justify-center bg-muted/30">
        <div class="w-full max-w-md space-y-4 rounded-xl border bg-background p-8 text-center shadow-sm">
            <div class="flex flex-col items-center gap-2">
                <KeyRound class="size-9 text-muted-foreground" />
                <h1 class="text-lg font-semibold">Licence requise</h1>
                <p class="text-sm text-muted-foreground">
                    Ce poste doit récupérer une licence active avant d’ouvrir la caisse.
                </p>
            </div>

            <div v-if="config.agence" class="rounded-md bg-muted/40 px-3 py-2 text-sm">
                {{ config.agence.nom }} · {{ config.agence.reference }}
            </div>

            <p v-if="config.licence" class="text-sm text-muted-foreground">
                Licence locale : {{ config.licence.code }} · expire le {{ config.licence.date_expiration }}
            </p>

            <p v-if="erreur" class="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{{ erreur }}</p>
            <p v-if="message" class="rounded-md bg-muted/40 px-3 py-2 text-sm text-muted-foreground">{{ message }}</p>

            <Button class="w-full" :disabled="enCours" @click="recuperer">
                <RefreshCw :class="['size-4', enCours ? 'animate-spin' : '']" />
                {{ enCours ? 'Recherche…' : 'Récupérer une licence' }}
            </Button>
        </div>
    </div>
</template>
