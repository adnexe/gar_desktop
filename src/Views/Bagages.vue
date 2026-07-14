<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { ClipboardList, Package, Plus, Printer } from '@lucide/vue';
import AppSidebarLayout from '@/Layouts/app/AppSidebarLayout.vue';
import BagageForm from '@/Components/bagage/BagageForm.vue';
import FinDeCaisseSimpleRecu from '@/Components/FinDeCaisseSimpleRecu.vue';
import { Button } from '@/Components/ui/button';
import { Input } from '@/Components/ui/input';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/Components/ui/dialog';
import { useConfigStore } from '@/Stores/config';
import { useSessionStore } from '@/Stores/session';
import type { BagageDuJour } from '@/types/bagage';

const config = useConfigStore();
const session = useSessionStore();

const aujourdhui = () => new Date().toISOString().slice(0, 10);
const dateFiltre = ref(aujourdhui());

const bagages = ref<BagageDuJour[]>([]);
const totalDuJour = computed(() => bagages.value.reduce((s, b) => s + b.montant, 0));

const dialogOuvert = ref(false);
const bagageForm = ref<InstanceType<typeof BagageForm> | null>(null);

async function charger() {
    if (!session.agenceId) {
        bagages.value = [];
        return;
    }
    bagages.value = (await window.api.bagage.duJour(session.agenceId, dateFiltre.value)) as BagageDuJour[];
}

function ouvrir() {
    bagageForm.value?.resetTout();
    dialogOuvert.value = true;
}

function onEnregistre(bagage: BagageDuJour) {
    if (dateFiltre.value === aujourdhui()) {
        bagages.value.unshift(bagage);
    }
}

watch(dateFiltre, charger);
onMounted(charger);

const finDeCaisseOuvert = ref(false);
const rapportFinDeCaisse = ref<{ date: string; nombre_bagages: number; montant_total: number } | null>(null);

async function ouvrirFinDeCaisse() {
    if (!session.agenceId) return;
    rapportFinDeCaisse.value = (await window.api.bagage.finDeCaisse(session.agenceId, dateFiltre.value)) as {
        date: string;
        nombre_bagages: number;
        montant_total: number;
    };
    finDeCaisseOuvert.value = true;
}

async function imprimerFinDeCaisse() {
    await nextTick();
    window.print();
}

const formatMontant = (m: number) => new Intl.NumberFormat('fr-FR').format(m) + ' FCFA';
</script>

<template>
    <AppSidebarLayout titre="Bagages">
        <div class="flex flex-col gap-5">
            <div class="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 class="flex items-center gap-2 text-xl font-semibold"><Package class="size-5" /> Bagages</h1>
                    <p class="text-[0.95rem] text-muted-foreground">Suivez les bagages du jour et enregistrez-en un nouveau</p>
                </div>

                <div class="flex items-center gap-2">
                    <Input v-model="dateFiltre" type="date" class="h-10 w-44 text-base" />
                    <Button variant="outline" :disabled="!session.agenceId" @click="ouvrirFinDeCaisse">
                        <ClipboardList />
                        Fin de caisse
                    </Button>
                    <Button :disabled="!session.agenceId" @click="ouvrir">
                        <Plus />
                        Enregistrer un bagage
                    </Button>
                </div>
            </div>

            <div class="overflow-hidden rounded-lg border bg-card p-5 shadow-sm">
                <div class="mb-3 flex items-center justify-between">
                    <p class="text-base font-medium">Bagages du {{ dateFiltre === aujourdhui() ? 'jour' : dateFiltre }}</p>
                    <span class="text-lg font-semibold">Total : {{ formatMontant(totalDuJour) }}</span>
                </div>

                <p v-if="bagages.length === 0" class="rounded-md bg-muted/40 px-4 py-6 text-center text-[0.95rem] text-muted-foreground">Aucun bagage pour cette date.</p>

                <table v-else class="w-full text-[0.95rem]">
                    <thead class="bg-muted/40">
                        <tr class="border-b text-left text-muted-foreground">
                            <th class="px-3 py-3 font-medium">Heure</th>
                            <th class="px-3 py-3 font-medium">N°</th>
                            <th class="px-3 py-3 font-medium">Ticket lié</th>
                            <th class="px-3 py-3 font-medium">Destination</th>
                            <th class="px-3 py-3 font-medium">Description</th>
                            <th class="px-3 py-3 text-right font-medium">Valeur déclarée</th>
                            <th class="px-3 py-3 text-right font-medium">Montant</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="b in bagages" :key="b.uuid" class="border-b last:border-0 hover:bg-muted/30">
                            <td class="px-3 py-3">{{ b.heure }}</td>
                            <td class="px-3 py-3 font-mono">{{ b.numero_bagage }}</td>
                            <td class="px-3 py-3">{{ b.numero_ticket ?? '—' }}</td>
                            <td class="px-3 py-3">{{ b.destination ?? '—' }}</td>
                            <td class="px-3 py-3">{{ b.description ?? '—' }}</td>
                            <td class="px-3 py-3 text-right">{{ b.valeur !== null ? formatMontant(b.valeur) : '—' }}</td>
                            <td class="px-3 py-3 text-right font-semibold">{{ formatMontant(b.montant) }}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>

        <Dialog v-model:open="dialogOuvert">
            <DialogContent class="flex max-h-[92vh] w-[92vw] max-w-4xl flex-col gap-0 overflow-y-auto p-0 sm:max-w-4xl">
                <DialogHeader class="border-b bg-background px-6 py-4">
                    <DialogTitle class="flex items-center gap-2"><Package class="size-5" /> Enregistrer un bagage</DialogTitle>
                </DialogHeader>
                <BagageForm ref="bagageForm" @enregistre="onEnregistre" @fermer="dialogOuvert = false" />
            </DialogContent>
        </Dialog>

        <Dialog v-model:open="finDeCaisseOuvert">
            <DialogContent class="sm:max-w-sm">
                <DialogHeader>
                    <DialogTitle class="flex items-center gap-2"><ClipboardList class="size-5" /> Fin de caisse — {{ dateFiltre }}</DialogTitle>
                </DialogHeader>
                <div v-if="rapportFinDeCaisse" class="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                    <span>{{ rapportFinDeCaisse.nombre_bagages }} bagage(s)</span>
                    <span class="text-lg font-semibold">{{ formatMontant(rapportFinDeCaisse.montant_total) }}</span>
                </div>
                <DialogFooter>
                    <Button variant="outline" @click="finDeCaisseOuvert = false">Fermer</Button>
                    <Button @click="imprimerFinDeCaisse"><Printer /> Imprimer</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        <div class="zone-impression hidden print:block">
            <FinDeCaisseSimpleRecu
                v-if="finDeCaisseOuvert && rapportFinDeCaisse"
                titre="FIN DE CAISSE — BAGAGES"
                :agence="config.agence ? `${config.agence.nom} — ${config.agence.ville_nom}` : ''"
                :caissier="session.nom"
                :date="rapportFinDeCaisse.date"
                libelle-compteur="Nombre de bagages"
                :nombre="rapportFinDeCaisse.nombre_bagages"
                :montant-total="rapportFinDeCaisse.montant_total"
            />
        </div>
    </AppSidebarLayout>
</template>
