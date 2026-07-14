<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { ClipboardList, Plus, Printer, Receipt, Ticket } from '@lucide/vue';
import AppSidebarLayout from '@/Layouts/app/AppSidebarLayout.vue';
import VenteForm from '@/Components/vente/VenteForm.vue';
import FinDeCaisseRecu, { type RapportFinDeCaisse } from '@/Components/vente/FinDeCaisseRecu.vue';
import { Badge } from '@/Components/ui/badge';
import { Button } from '@/Components/ui/button';
import { Input } from '@/Components/ui/input';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/Components/ui/dialog';
import { useConfigStore } from '@/Stores/config';
import { useSessionStore } from '@/Stores/session';
import type { VenteDuJour } from '@/types/vente';

interface Ville { id: number; uuid: string; nom: string }

const config = useConfigStore();
const session = useSessionStore();

const villes = ref<Ville[]>([]);
const dialogOuvert = ref(false);
const venteForm = ref<InstanceType<typeof VenteForm> | null>(null);

function ouvrirVente() {
    venteForm.value?.resetTout();
    dialogOuvert.value = true;
}

const aujourdhui = () => new Date().toISOString().slice(0, 10);
const dateFiltre = ref(aujourdhui());

const ventesDuJour = ref<VenteDuJour[]>([]);
const recherche = ref('');
// Filtre local : numéro de ticket, nom/prénoms ou téléphone du client.
const ventesAffichees = computed(() => {
    const t = recherche.value.trim().toLowerCase();
    if (!t) return ventesDuJour.value;
    return ventesDuJour.value.filter((v) =>
        (v.numero_ticket ?? '').toLowerCase().includes(t) ||
        (v.client ?? '').toLowerCase().includes(t) ||
        (v.client_telephone ?? '').toLowerCase().includes(t),
    );
});
const totalDuJour = computed(() => ventesDuJour.value.reduce((total, vente) => total + vente.total, 0));

async function chargerVentes() {
    if (!session.agenceId) {
        ventesDuJour.value = [];
        return;
    }

    ventesDuJour.value = (await window.api.vente.ventesDuJour(session.agenceId, dateFiltre.value)) as VenteDuJour[];
}

function onVendu(vente: VenteDuJour) {
    if (dateFiltre.value === aujourdhui()) {
        ventesDuJour.value.unshift(vente);
    }
}

watch(dateFiltre, chargerVentes);

onMounted(async () => {
    villes.value = await window.api.referentiel.villes();
    await chargerVentes();
});

const finDeCaisseOuvert = ref(false);
const rapportFinDeCaisse = ref<RapportFinDeCaisse | null>(null);

async function ouvrirFinDeCaisse() {
    if (!session.agenceId) return;
    rapportFinDeCaisse.value = (await window.api.vente.finDeCaisse(session.agenceId, dateFiltre.value)) as RapportFinDeCaisse;
    finDeCaisseOuvert.value = true;
}

async function imprimerFinDeCaisse() {
    await nextTick();
    window.print();
}

const formatMontant = (montant: number) => new Intl.NumberFormat('fr-FR').format(montant) + ' FCFA';
</script>

<template>
    <AppSidebarLayout titre="Vente de tickets">
        <div class="flex flex-col gap-5">
            <div class="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 class="text-xl font-semibold">Vente de tickets</h1>
                    <p class="text-[0.95rem] text-muted-foreground">Suivez les ventes du jour et enregistrez un nouveau ticket</p>
                </div>

                <div class="flex items-center gap-2">
                    <Input v-model="dateFiltre" type="date" class="w-44" />
                    <Button variant="outline" @click="ouvrirFinDeCaisse">
                        <ClipboardList />
                        Fin de caisse
                    </Button>
                    <Button :disabled="!session.agenceId" @click="ouvrirVente">
                        <Plus />
                        Vendre un ticket
                    </Button>
                </div>
            </div>

            <div class="overflow-hidden rounded-lg border bg-card p-5 shadow-sm">
                <div class="mb-3 flex items-center justify-between">
                    <p class="flex items-center gap-2 text-base font-medium">
                        <Receipt class="size-4" /> Ventes du {{ dateFiltre === aujourdhui() ? "jour" : dateFiltre }}
                    </p>
                    <span class="text-lg font-semibold">
                        Total : {{ formatMontant(totalDuJour) }}
                    </span>
                </div>

                <Input v-model="recherche" placeholder="Rechercher : n° ticket, client, téléphone…" class="mb-3 h-10 max-w-md text-base" />

                <p v-if="ventesAffichees.length === 0" class="rounded-md bg-muted/40 px-4 py-6 text-center text-[0.95rem] text-muted-foreground">
                    {{ recherche ? 'Aucun résultat pour cette recherche.' : 'Aucune vente enregistrée pour cette date.' }}
                </p>

                <table v-else class="w-full text-[0.95rem]">
                    <thead class="bg-muted/40">
                        <tr class="border-b text-left text-muted-foreground">
                            <th class="px-3 py-3 font-medium">Heure</th>
                            <th class="px-3 py-3 font-medium">N°</th>
                            <th class="px-3 py-3 font-medium">Trajet</th>
                            <th class="px-3 py-3 font-medium">Place</th>
                            <th class="px-3 py-3 font-medium">Client</th>
                            <th class="px-3 py-3 text-right font-medium">Prix</th>
                            <th class="px-3 py-3 text-right font-medium">Timbre</th>
                            <th class="px-3 py-3 text-right font-medium">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="vente in ventesAffichees" :key="vente.uuid" class="border-b last:border-0 hover:bg-muted/30">
                            <td class="px-3 py-3">{{ vente.heure }}</td>
                            <td class="px-3 py-3 font-mono">{{ vente.numero_ticket }}</td>
                            <td class="px-3 py-3">{{ vente.trajet }}</td>
                            <td class="px-3 py-3">N° {{ vente.numero_place }}</td>
                            <td class="px-3 py-3">{{ vente.client ?? '—' }}</td>
                            <td class="px-3 py-3 text-right">{{ formatMontant(vente.montant) }}</td>
                            <td class="px-3 py-3 text-right">{{ formatMontant(vente.timbre) }}</td>
                            <td class="px-3 py-3 text-right font-semibold">
                                {{ formatMontant(vente.total) }}
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>

        <Dialog v-model:open="dialogOuvert">
            <!-- Hauteur fixe + overflow-hidden : pas de scroll global, chaque
                 colonne du formulaire gère son propre défilement interne. -->
            <DialogContent class="flex h-[90vh] w-[96vw] max-w-[96vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-[96vw] xl:max-w-7xl">
                <DialogHeader class="shrink-0 border-b bg-background px-6 py-4">
                    <DialogTitle class="flex items-center gap-2">
                        <Ticket class="size-5" /> Vente de tickets
                        <Badge v-if="config.agence" variant="outline" class="ml-auto mr-6">
                            {{ config.agence.nom }} — {{ config.agence.ville_nom }}
                        </Badge>
                    </DialogTitle>
                </DialogHeader>

                <VenteForm
                    ref="venteForm"
                    :agence-id="config.agence?.id ?? null"
                    :ville-depart-id="config.agence?.ville_id ?? null"
                    :villes="villes"
                    @vendu="onVendu"
                    @fermer="dialogOuvert = false"
                />
            </DialogContent>
        </Dialog>

        <!-- Rapport de fin de caisse : nombre de tickets et montant par voyage,
             pour faire le point avec le chef de gare avant de clôturer. -->
        <Dialog v-model:open="finDeCaisseOuvert">
            <DialogContent class="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle class="flex items-center gap-2"><ClipboardList class="size-5" /> Fin de caisse — {{ dateFiltre }}</DialogTitle>
                </DialogHeader>

                <div v-if="rapportFinDeCaisse" class="space-y-2 text-sm">
                    <div v-for="v in rapportFinDeCaisse.voyages" :key="v.voyage_id" class="flex items-center justify-between rounded-md border px-3 py-2">
                        <div>
                            <p class="font-medium">{{ v.trajet }}</p>
                            <p class="text-xs text-muted-foreground">{{ v.heure_depart }} · {{ v.nombre_tickets }} ticket(s)</p>
                        </div>
                        <span class="font-semibold">{{ formatMontant(v.montant_total) }}</span>
                    </div>
                    <p v-if="rapportFinDeCaisse.voyages.length === 0" class="text-sm text-muted-foreground">
                        Aucune vente pour cette date.
                    </p>
                    <div class="flex items-center justify-between border-t pt-2 font-semibold">
                        <span>{{ rapportFinDeCaisse.nombre_tickets_total }} ticket(s) au total</span>
                        <span class="text-lg">{{ formatMontant(rapportFinDeCaisse.montant_total) }}</span>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" @click="finDeCaisseOuvert = false">Fermer</Button>
                    <Button @click="imprimerFinDeCaisse"><Printer /> Imprimer</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        <div class="zone-impression hidden print:block">
            <FinDeCaisseRecu
                v-if="finDeCaisseOuvert"
                :rapport="rapportFinDeCaisse"
                :agence="config.agence ? `${config.agence.nom} — ${config.agence.ville_nom}` : ''"
                :caissier="session.nom"
            />
        </div>
    </AppSidebarLayout>
</template>
