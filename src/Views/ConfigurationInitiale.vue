<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { RefreshCw } from '@lucide/vue';
import { Button } from '@/Components/ui/button';
import { Input } from '@/Components/ui/input';
import AppLogoIcon from '@/Components/AppLogoIcon.vue';
import { Label } from '@/Components/ui/label';
import { useConfigStore } from '@/Stores/config';

const reference = ref('');
const enCours = ref(false);
const erreur = ref('');
const messageLicence = ref('');
const licenceBloquee = ref(false);
const config = useConfigStore();
const router = useRouter();

async function valider() {
    if (!reference.value.trim()) return;

    enCours.value = true;
    erreur.value = '';
    messageLicence.value = '';
    licenceBloquee.value = false;

    try {
        const referenceAgence = reference.value.trim().toUpperCase();
        const licence = await config.reclamerLicence(referenceAgence, 'poste-caisse');

        if (!licence.ok) {
            licenceBloquee.value = true;
            messageLicence.value = licence.message || "Aucune licence disponible pour cette agence.";
            return;
        }

        messageLicence.value = licence.message;
        await config.configurer(referenceAgence, 'poste-caisse');
        router.push({ name: 'connexion' });
    } catch {
        erreur.value = "Référence agence introuvable, agence désactivée, ou pas de connexion internet pour ce premier réglage.";
    } finally {
        enCours.value = false;
    }
}

</script>

<template>
    <div class="flex min-h-screen items-center justify-center overflow-y-auto bg-muted/30 p-4">
        <form class="w-full max-w-md space-y-5 rounded-xl border bg-background p-8 shadow-sm" @submit.prevent="valider">
            <div class="flex flex-col items-center gap-2 text-center">
                <div class="flex aspect-square size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                    <AppLogoIcon class="size-8" />
                </div>
                <h1 class="text-lg font-semibold">Configuration de l'agence</h1>
                <p class="text-sm font-medium text-muted-foreground">Adenexe Transport</p>
                <p class="text-sm text-muted-foreground">
                    Saisissez la référence de votre agence (ex : AG-7K2M9Q). Une connexion internet est nécessaire
                    uniquement pour cette première étape.
                </p>
            </div>

            <div class="space-y-1.5">
                <Label for="reference">Référence agence</Label>
                <Input id="reference" v-model="reference" placeholder="AG-XXXXXX" autofocus />
            </div>

            <p v-if="erreur" class="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{{ erreur }}</p>
            <div v-if="licenceBloquee" class="space-y-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
                <p class="font-medium text-destructive">Licence requise</p>
                <p class="text-muted-foreground">{{ messageLicence }}</p>
                <Button type="button" variant="outline" class="w-full" :disabled="enCours" @click="valider">
                    <RefreshCw :class="['size-4', enCours ? 'animate-spin' : '']" />
                    Récupérer une licence
                </Button>
            </div>
            <p v-else-if="messageLicence" class="rounded-md bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                {{ messageLicence }}
            </p>

            <Button type="submit" class="w-full" :disabled="enCours || !reference.trim()">
                {{ enCours ? 'Vérification…' : 'Configurer cet appareil' }}
            </Button>

        </form>
    </div>
</template>
