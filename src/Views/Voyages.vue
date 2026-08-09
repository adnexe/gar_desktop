<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { Bus, Plus, RefreshCw } from '@lucide/vue';
import AppSidebarLayout from '@/Layouts/app/AppSidebarLayout.vue';
import VoyageForm from '@/Components/voyage/VoyageForm.vue';
import { Badge } from '@/Components/ui/badge';
import { Button } from '@/Components/ui/button';
import { Input } from '@/Components/ui/input';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/Components/ui/dialog';
import { useConfigStore } from '@/Stores/config';

interface VoyageListe {
    id: number;
    uuid: string;
    date_depart: string;
    heure_depart: string;
    numero_depart: number;
    statut: string;
    itineraire_nom: string | null;
    vehicule_immatriculation: string;
    nombre_places: number;
    chauffeur_nom: string | null;
    tickets_vendus: number;
}
interface VoyageEdition {
    uuid: string;
    itineraire_id: number;
    vehicule_id: number;
    chauffeur_id: number | null;
    date_depart: string;
    heure_depart: string;
    numero_depart: number;
    statut: string;
}

const STATUT_LABELS: Record<string, string> = {
    programme: 'Programmé',
    embarquement: 'Embarquement',
    parti: 'Parti',
    termine: 'Terminé',
    annule: 'Annulé',
};
const STATUT_VARIANTS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    programme: 'default',
    embarquement: 'outline',
    parti: 'secondary',
    termine: 'secondary',
    annule: 'destructive',
};
type ReseauLocal = {
    mode: 'autonome' | 'serveur' | 'client';
    serveurUrl: string | null;
    port: number;
    secret: string | null;
    actif: boolean;
    adresses: string[];
    agence: string | null;
};

const config = useConfigStore();
const reseau = ref<ReseauLocal | null>(null);
const posteClient = computed(() => reseau.value?.mode === 'client');
const peutCreerVoyage = computed(() => !posteClient.value);

const aujourdhui = () => new Date().toISOString().slice(0, 10);
const dateFiltre = ref(aujourdhui());

const voyages = ref<VoyageListe[]>([]);
const dialogOuvert = ref(false);
const chargement = ref(false);
const rafraichissementServeur = ref(false);
const message = ref('');
const erreur = ref('');
let intervalleVoyages: ReturnType<typeof setInterval> | null = null;

function formatDateAffichee(date: string) {
    const [annee, mois, jour] = date.slice(0, 10).split('-');

    return annee && mois && jour ? `${jour}/${mois}/${annee}` : date;
}

async function charger() {
    if (!config.agence) {
        voyages.value = [];
        return;
    }

    chargement.value = true;
    try {
        voyages.value = (await window.api.voyage.liste(config.agence.id, dateFiltre.value)) as VoyageListe[];
    } catch (e) {
        // En mode client, on garde la dernière liste si la caisse est momentanément injoignable.
        erreur.value = e instanceof Error ? e.message : 'Impossible de charger les voyages.';
    } finally {
        chargement.value = false;
    }
}

async function chargerReseau() {
    try {
        reseau.value = await window.api.config.reseauLocal();
    } catch {
        reseau.value = null;
    }
}

async function actualiserDepuisServeur(silencieux = false) {
    if (!config.agence || !posteClient.value) return;

    rafraichissementServeur.value = true;
    if (!silencieux) {
        message.value = '';
        erreur.value = '';
    }

    try {
        const resultat = await window.api.config.actualiserVoyagesServeurLocal(config.agence.id, dateFiltre.value);
        if (!silencieux) {
            message.value = resultat.message;
        }
    } catch (e) {
        if (!silencieux) {
            erreur.value = e instanceof Error ? e.message : 'Impossible de récupérer les voyages de la caisse serveur.';
        }
    } finally {
        rafraichissementServeur.value = false;
    }
}

async function actualiser() {
    message.value = '';
    erreur.value = '';
    await actualiserDepuisServeur(false);
    await charger();
}

// `voyageEdition` porte les données à éditer (null = création). `dialogKey`
// force un remontage complet de VoyageForm à chaque ouverture : ses champs
// s'initialisent directement depuis la prop au montage, sans dépendre du
// timing d'ouverture du dialog (pas de méthode exposée à appeler après-coup).
const voyageEdition = ref<VoyageEdition | null>(null);
const dialogKey = ref(0);
const erreurEdition = ref('');

function ouvrir() {
    if (!peutCreerVoyage.value) return;

    voyageEdition.value = null;
    dialogKey.value++;
    dialogOuvert.value = true;
}

async function ouvrirEdition(v: VoyageListe) {
    if (!peutCreerVoyage.value) return;

    erreurEdition.value = '';
    const details = (await window.api.voyage.details(v.uuid)) as VoyageEdition | null;
    if (!details) {
        erreurEdition.value = 'Ce voyage est introuvable localement.';
        return;
    }

    voyageEdition.value = details;
    dialogKey.value++;
    dialogOuvert.value = true;
}

function onEnregistre() {
    dialogOuvert.value = false;
    void charger();
}

watch(dateFiltre, () => {
    void actualiser();
});
onMounted(async () => {
    await chargerReseau();
    await actualiserDepuisServeur(true);
    await charger();
    intervalleVoyages = setInterval(() => {
        void actualiser();
    }, 15000);
});

onUnmounted(() => {
    if (intervalleVoyages) {
        clearInterval(intervalleVoyages);
    }
});
</script>

<template>
    <AppSidebarLayout titre="Voyages">
        <div class="flex flex-col gap-5">
            <div class="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 class="flex items-center gap-2 text-xl font-semibold"><Bus class="size-5" /> Voyages</h1>
                    <p class="text-[0.95rem] text-muted-foreground">Voyages programmés pour l'agence</p>
                </div>

                <!-- flex-wrap : sur les petits écrans, les boutons passent à
                     la ligne au lieu de déborder du cadre. -->
                <div class="flex w-full flex-wrap items-center gap-2 lg:w-auto">
                    <Input v-model="dateFiltre" type="date" class="w-44" />
                    <Button variant="outline" :disabled="chargement || rafraichissementServeur" @click="actualiser">
                        <RefreshCw :class="['size-4', (chargement || rafraichissementServeur) ? 'animate-spin' : '']" />
                        {{ posteClient ? 'Actualiser depuis caisse' : 'Actualiser' }}
                    </Button>
                    <Button v-if="peutCreerVoyage" :disabled="!config.agence" @click="ouvrir">
                        <Plus />
                        Créer un voyage
                    </Button>
                </div>
            </div>

            <p v-if="message" class="rounded-md bg-muted/50 px-4 py-3 text-sm text-muted-foreground">{{ message }}</p>
            <p v-if="erreur" class="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">{{ erreur }}</p>
            <p v-if="erreurEdition" class="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">{{ erreurEdition }}</p>

            <div class="overflow-hidden rounded-lg border bg-card p-5 shadow-sm">
                <p v-if="voyages.length === 0" class="rounded-md bg-muted/40 px-4 py-6 text-center text-[0.95rem] text-muted-foreground">Aucun voyage pour cette date.</p>

                <div v-else class="overflow-x-auto">
                <table class="w-full text-[0.95rem]">
                    <thead class="bg-muted/40">
                        <tr class="border-b text-left text-muted-foreground">
                            <th class="px-3 py-3 font-medium">Date</th>
                            <th class="px-3 py-3 font-medium">Heure</th>
                            <th class="px-3 py-3 font-medium">Itinéraire</th>
                            <th class="px-3 py-3 font-medium">Véhicule</th>
                            <th class="px-3 py-3 font-medium">Chauffeur</th>
                            <th class="px-3 py-3 text-right font-medium">Places vendues</th>
                            <th class="px-3 py-3 font-medium">Statut</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr
                            v-for="v in voyages"
                            :key="v.uuid"
                            class="border-b last:border-0 hover:bg-muted/30"
                            :class="{ 'cursor-pointer': peutCreerVoyage }"
                            :title="peutCreerVoyage ? 'Modifier ce voyage' : undefined"
                            @click="ouvrirEdition(v)"
                        >
                            <td class="px-3 py-3 font-medium">{{ formatDateAffichee(v.date_depart) }}</td>
                            <td class="px-3 py-3">{{ v.heure_depart }} ({{ v.numero_depart === 1 ? '1er' : `${v.numero_depart}e` }})</td>
                            <td class="px-3 py-3">{{ v.itineraire_nom }}</td>
                            <td class="px-3 py-3">{{ v.vehicule_immatriculation }}</td>
                            <td class="px-3 py-3">{{ v.chauffeur_nom ?? '—' }}</td>
                            <td class="px-3 py-3 text-right">{{ v.tickets_vendus }} / {{ v.nombre_places }}</td>
                            <td class="px-3 py-3"><Badge :variant="STATUT_VARIANTS[v.statut] ?? 'outline'">{{ STATUT_LABELS[v.statut] ?? v.statut }}</Badge></td>
                        </tr>
                    </tbody>
                </table>
                </div>
            </div>
        </div>

        <Dialog v-if="peutCreerVoyage" v-model:open="dialogOuvert">
            <DialogContent class="max-w-lg gap-0 overflow-hidden p-0">
                <DialogHeader class="border-b bg-background px-6 py-4">
                    <DialogTitle class="flex items-center gap-2"><Bus class="size-5" /> {{ voyageEdition ? 'Modifier le voyage' : 'Créer un voyage' }}</DialogTitle>
                </DialogHeader>
                <VoyageForm :key="dialogKey" :voyage="voyageEdition" @enregistre="onEnregistre" @fermer="dialogOuvert = false" />
            </DialogContent>
        </Dialog>
    </AppSidebarLayout>
</template>
