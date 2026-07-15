<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { Car, RefreshCw } from '@lucide/vue';
import AppSidebarLayout from '@/Layouts/app/AppSidebarLayout.vue';
import { Button } from '@/Components/ui/button';
import { useConfigStore } from '@/Stores/config';

interface VehiculeCatalogue {
    id: number;
    uuid: string;
    immatriculation: string;
    marque: string | null;
    modele: string | null;
    nombre_places: number;
    statut: string;
}

const config = useConfigStore();
const vehicules = ref<VehiculeCatalogue[]>([]);
const chargement = ref(false);
const actualisation = ref(false);
const message = ref('');
const avertissement = ref('');
const erreur = ref('');

function messageErreur(e: unknown, defaut: string) {
    if (!(e instanceof Error)) return defaut;

    return e.message
        .replace(/^Error invoking remote method '[^']+': Error: /, '')
        .replace(/^Error invoking remote method "[^"]+": Error: /, '');
}

function libelleStatut(statut: string) {
    if (statut === 'disponible') return 'Disponible';
    if (statut === 'maintenance') return 'Maintenance';
    if (statut === 'indisponible') return 'Indisponible';

    return statut;
}

function badgeStatut(statut: string) {
    return [
        'rounded-md px-2.5 py-1 text-xs font-semibold',
        statut === 'disponible'
            ? 'bg-emerald-100 text-emerald-700'
            : statut === 'maintenance'
                ? 'bg-amber-100 text-amber-700'
                : 'bg-muted text-muted-foreground',
    ];
}

async function chargerLocal() {
    chargement.value = true;
    erreur.value = '';

    try {
        vehicules.value = await window.api.referentiel.vehicules();
    } catch (e) {
        vehicules.value = [];
        erreur.value = messageErreur(e, 'Impossible de charger les véhicules locaux.');
    } finally {
        chargement.value = false;
    }
}

async function actualiser() {
    actualisation.value = true;
    message.value = '';
    avertissement.value = '';
    erreur.value = '';

    try {
        const resultat = await window.api.config.actualiser();
        await config.charger();

        if (resultat.ok) {
            message.value = 'Véhicules actualisés depuis admin.';
        } else {
            avertissement.value = resultat.erreur ?? 'Admin injoignable, les véhicules locaux sont affichés.';
        }
    } catch (e) {
        avertissement.value = messageErreur(e, 'Impossible de joindre admin, les véhicules locaux sont affichés.');
    } finally {
        await chargerLocal();
        actualisation.value = false;
    }
}

onMounted(() => {
    void chargerLocal();
});
</script>

<template>
    <AppSidebarLayout titre="Véhicules">
        <div class="space-y-5">
            <section class="rounded-lg border bg-card p-5 shadow-sm">
                <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                        <h1 class="flex items-center gap-2 text-xl font-semibold"><Car class="size-5" /> Véhicules</h1>
                        <p class="mt-1 text-[0.95rem] text-muted-foreground">Véhicules disponibles dans le référentiel local.</p>
                    </div>

                    <Button type="button" variant="outline" :disabled="actualisation || chargement" @click="actualiser">
                        <RefreshCw :class="['size-4', (actualisation || chargement) ? 'animate-spin text-primary' : '']" />
                        {{ actualisation ? 'Actualisation...' : 'Actualiser' }}
                    </Button>
                </div>
            </section>

            <p v-if="message" class="rounded-md bg-muted/50 px-4 py-3 text-sm text-muted-foreground">{{ message }}</p>
            <p v-if="avertissement" class="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-700">{{ avertissement }}</p>
            <p v-if="erreur" class="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">{{ erreur }}</p>

            <section class="overflow-hidden rounded-lg border bg-card p-5 shadow-sm">
                <p v-if="chargement" class="rounded-md bg-muted/40 px-4 py-6 text-center text-[0.95rem] text-muted-foreground">Chargement des véhicules...</p>
                <p v-else-if="vehicules.length === 0" class="rounded-md bg-muted/40 px-4 py-6 text-center text-[0.95rem] text-muted-foreground">Aucun véhicule synchronisé.</p>

                <table v-else class="w-full text-[0.95rem]">
                    <thead class="bg-muted/40">
                        <tr class="border-b text-left text-muted-foreground">
                            <th class="px-3 py-3 font-medium">Immatriculation</th>
                            <th class="px-3 py-3 font-medium">Marque / modèle</th>
                            <th class="px-3 py-3 text-right font-medium">Places</th>
                            <th class="px-3 py-3 font-medium">Statut</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="vehicule in vehicules" :key="vehicule.uuid" class="border-b last:border-0 hover:bg-muted/30">
                            <td class="px-3 py-3 font-semibold">{{ vehicule.immatriculation }}</td>
                            <td class="px-3 py-3">{{ [vehicule.marque, vehicule.modele].filter(Boolean).join(' ') || '—' }}</td>
                            <td class="px-3 py-3 text-right font-semibold">{{ vehicule.nombre_places }}</td>
                            <td class="px-3 py-3">
                                <span :class="badgeStatut(vehicule.statut)">{{ libelleStatut(vehicule.statut) }}</span>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </section>
        </div>
    </AppSidebarLayout>
</template>
