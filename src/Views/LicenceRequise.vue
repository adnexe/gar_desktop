<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { KeyRound, RefreshCw } from '@lucide/vue';
import { Button } from '@/Components/ui/button';
import { useConfigStore } from '@/Stores/config';

const config = useConfigStore();
const router = useRouter();

const enCours = ref(false);
const message = ref('');
const erreur = ref('');
const codePoste = ref('');

const reference = computed(() => config.agence?.reference ?? '');

watch(
    () => config.licence?.code_poste,
    (code) => {
        codePoste.value = code ?? '';
    },
    { immediate: true },
);

async function recuperer() {
    if (!reference.value) {
        erreur.value = "Référence agence introuvable sur ce poste.";
        return;
    }
    if (!codePoste.value.trim()) {
        erreur.value = "Saisissez le numéro de poste indiqué sur la licence.";
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

        const resultat = await config.reclamerLicence(reference.value, 'poste-caisse', normaliserCodePoste(codePoste.value));

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

function normaliserCodePoste(valeur: string) {
    return valeur.trim().padStart(3, '0');
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

            <div class="space-y-1.5 text-left">
                <label for="code_poste" class="text-sm font-medium">Numéro de poste</label>
                <input
                    id="code_poste"
                    v-model="codePoste"
                    class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    placeholder="Ex : 001"
                    maxlength="10"
                />
            </div>

            <p v-if="erreur" class="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{{ erreur }}</p>
            <p v-if="message" class="rounded-md bg-muted/40 px-3 py-2 text-sm text-muted-foreground">{{ message }}</p>

            <Button class="w-full" :disabled="enCours || !codePoste.trim()" @click="recuperer">
                <RefreshCw :class="['size-4', enCours ? 'animate-spin' : '']" />
                {{ enCours ? 'Recherche…' : 'Récupérer une licence' }}
            </Button>
        </div>
    </div>
</template>
