<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { RefreshCw, Users } from '@lucide/vue';
import AppSidebarLayout from '@/Layouts/app/AppSidebarLayout.vue';
import { Button } from '@/Components/ui/button';
import { useConfigStore } from '@/Stores/config';

interface ChauffeurCatalogue {
    id: number;
    uuid: string;
    nom: string;
    telephone: string | null;
    numero_permis: string | null;
    statut: string;
}

const config = useConfigStore();
const chauffeurs = ref<ChauffeurCatalogue[]>([]);
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
    if (statut === 'suspendu') return 'Suspendu';
    if (statut === 'inactif') return 'Inactif';

    return statut;
}

function badgeStatut(statut: string) {
    return [
        'rounded-md px-2.5 py-1 text-xs font-semibold',
        statut === 'disponible'
            ? 'bg-emerald-100 text-emerald-700'
            : statut === 'suspendu'
                ? 'bg-amber-100 text-amber-700'
                : 'bg-muted text-muted-foreground',
    ];
}

async function chargerLocal() {
    chargement.value = true;
    erreur.value = '';

    try {
        chauffeurs.value = await window.api.referentiel.chauffeurs();
    } catch (e) {
        chauffeurs.value = [];
        erreur.value = messageErreur(e, 'Impossible de charger les chauffeurs locaux.');
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
            message.value = 'Chauffeurs actualisés depuis admin.';
        } else {
            avertissement.value = 'Admin injoignable, les chauffeurs locaux sont affichés.';
        }
    } catch (e) {
        avertissement.value = messageErreur(e, 'Impossible de joindre admin, les chauffeurs locaux sont affichés.');
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
    <AppSidebarLayout titre="Chauffeurs">
        <div class="space-y-5">
            <section class="rounded-lg border bg-card p-5 shadow-sm">
                <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                        <h1 class="flex items-center gap-2 text-xl font-semibold"><Users class="size-5" /> Chauffeurs</h1>
                        <p class="mt-1 text-[0.95rem] text-muted-foreground">Chauffeurs disponibles dans le référentiel local.</p>
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
                <p v-if="chargement" class="rounded-md bg-muted/40 px-4 py-6 text-center text-[0.95rem] text-muted-foreground">Chargement des chauffeurs...</p>
                <p v-else-if="chauffeurs.length === 0" class="rounded-md bg-muted/40 px-4 py-6 text-center text-[0.95rem] text-muted-foreground">Aucun chauffeur synchronisé.</p>

                <table v-else class="w-full text-[0.95rem]">
                    <thead class="bg-muted/40">
                        <tr class="border-b text-left text-muted-foreground">
                            <th class="px-3 py-3 font-medium">Nom</th>
                            <th class="px-3 py-3 font-medium">Téléphone</th>
                            <th class="px-3 py-3 font-medium">Permis</th>
                            <th class="px-3 py-3 font-medium">Statut</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="chauffeur in chauffeurs" :key="chauffeur.uuid" class="border-b last:border-0 hover:bg-muted/30">
                            <td class="px-3 py-3 font-semibold">{{ chauffeur.nom }}</td>
                            <td class="px-3 py-3">{{ chauffeur.telephone ?? '—' }}</td>
                            <td class="px-3 py-3">{{ chauffeur.numero_permis ?? '—' }}</td>
                            <td class="px-3 py-3">
                                <span :class="badgeStatut(chauffeur.statut)">{{ libelleStatut(chauffeur.statut) }}</span>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </section>
        </div>
    </AppSidebarLayout>
</template>
