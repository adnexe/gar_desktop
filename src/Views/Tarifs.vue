<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { RefreshCw, Tags } from '@lucide/vue';
import AppSidebarLayout from '@/Layouts/app/AppSidebarLayout.vue';
import { Button } from '@/Components/ui/button';
import { useConfigStore } from '@/Stores/config';

interface TarifCatalogue {
    uuid: string;
    trajet: string | null;
    type_billet: string;
    tarification: string;
    montant: number;
    actif: number;
}

const config = useConfigStore();
const tarifs = ref<TarifCatalogue[]>([]);
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

function formatMontant(montant: number) {
    return `${new Intl.NumberFormat('fr-FR').format(montant)} FCFA`;
}

function libelleTypeBillet(type: string) {
    if (type === 'aller_retour') return 'Aller-retour';
    if (type === 'retour') return 'Retour';

    return 'Aller simple';
}

function libelleTarification(tarification: string) {
    if (tarification === 'vip') return 'VIP';
    if (tarification === 'enfant') return 'Enfant';
    if (tarification === 'bagage') return 'Bagage';

    return 'Ordinaire';
}

function badgeStatut(actif: number) {
    return [
        'rounded-md px-2.5 py-1 text-xs font-semibold',
        actif ? 'bg-emerald-100 text-emerald-700' : 'bg-muted text-muted-foreground',
    ];
}

async function chargerLocal() {
    if (!config.agence) {
        await config.charger();
    }

    if (!config.agence) {
        tarifs.value = [];
        erreur.value = 'Agence non configurée sur ce poste.';
        return;
    }

    chargement.value = true;
    erreur.value = '';

    try {
        tarifs.value = await window.api.referentiel.tarifsAgence(config.agence.id);
    } catch (e) {
        tarifs.value = [];
        erreur.value = messageErreur(e, 'Impossible de charger les tarifs locaux.');
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
            message.value = 'Tarifs actualisés depuis admin.';
        } else {
            avertissement.value = resultat.erreur ?? 'Admin injoignable, les tarifs locaux sont affichés.';
        }
    } catch (e) {
        avertissement.value = messageErreur(e, 'Impossible de joindre admin, les tarifs locaux sont affichés.');
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
    <AppSidebarLayout titre="Tarifs">
        <div class="space-y-5">
            <section class="rounded-lg border bg-card p-5 shadow-sm">
                <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                        <h1 class="flex items-center gap-2 text-xl font-semibold"><Tags class="size-5" /> Tarifs</h1>
                        <p class="mt-1 text-[0.95rem] text-muted-foreground">Tarifs synchronisés pour l'agence actuelle.</p>
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
                <p v-if="chargement" class="rounded-md bg-muted/40 px-4 py-6 text-center text-[0.95rem] text-muted-foreground">Chargement des tarifs...</p>
                <p v-else-if="tarifs.length === 0" class="rounded-md bg-muted/40 px-4 py-6 text-center text-[0.95rem] text-muted-foreground">Aucun tarif synchronisé pour cette agence.</p>

                <table v-else class="w-full text-[0.95rem]">
                    <thead class="bg-muted/40">
                        <tr class="border-b text-left text-muted-foreground">
                            <th class="px-3 py-3 font-medium">Trajet</th>
                            <th class="px-3 py-3 font-medium">Tarification</th>
                            <th class="px-3 py-3 font-medium">Type</th>
                            <th class="px-3 py-3 text-right font-medium">Montant</th>
                            <th class="px-3 py-3 font-medium">Statut</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="tarif in tarifs" :key="tarif.uuid" class="border-b last:border-0 hover:bg-muted/30">
                            <td class="px-3 py-3 font-medium">{{ tarif.trajet ?? '—' }}</td>
                            <td class="px-3 py-3">{{ libelleTarification(tarif.tarification) }}</td>
                            <td class="px-3 py-3">{{ libelleTypeBillet(tarif.type_billet) }}</td>
                            <td class="px-3 py-3 text-right font-semibold">{{ formatMontant(tarif.montant) }}</td>
                            <td class="px-3 py-3">
                                <span :class="badgeStatut(tarif.actif)">{{ tarif.actif ? 'Actif' : 'Inactif' }}</span>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </section>
        </div>
    </AppSidebarLayout>
</template>
