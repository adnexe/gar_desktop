<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { ClipboardList, Plus, Printer, Send } from '@lucide/vue';
import AppSidebarLayout from '@/Layouts/app/AppSidebarLayout.vue';
import CourrierForm from '@/Components/courrier/CourrierForm.vue';
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
import type { CourrierDuJour } from '@/types/courrier';

const config = useConfigStore();
const session = useSessionStore();

const aujourdhui = () => new Date().toISOString().slice(0, 10);
const dateFiltre = ref(aujourdhui());

const courriers = ref<CourrierDuJour[]>([]);
const recherche = ref('');
// Filtre local : n° courrier, destinataire ou expéditeur (nom/prénoms/téléphone).
const courriersAffiches = computed(() => {
    const t = recherche.value.trim().toLowerCase();
    if (!t) return courriers.value;
    return courriers.value.filter((c) =>
        (c.numero_courrier ?? '').toLowerCase().includes(t) ||
        (c.destinataire ?? '').toLowerCase().includes(t) ||
        (c.destinataire_telephone ?? '').toLowerCase().includes(t) ||
        (c.expediteur ?? '').toLowerCase().includes(t) ||
        (c.expediteur_telephone ?? '').toLowerCase().includes(t),
    );
});
const totalDuJour = computed(() => courriers.value.reduce((s, c) => s + c.montant_total, 0));

const dialogOuvert = ref(false);
const courrierForm = ref<InstanceType<typeof CourrierForm> | null>(null);

async function charger() {
    if (!session.agenceId) {
        courriers.value = [];
        return;
    }
    courriers.value = (await window.api.courrier.duJour(session.agenceId, dateFiltre.value)) as CourrierDuJour[];
}

function ouvrir() {
    courrierForm.value?.resetTout();
    dialogOuvert.value = true;
}

function onEnregistre(courrier: CourrierDuJour) {
    if (dateFiltre.value === aujourdhui()) {
        courriers.value.unshift(courrier);
    }
}

watch(dateFiltre, charger);
onMounted(charger);

const finDeCaisseOuvert = ref(false);
const rapportFinDeCaisse = ref<{ date: string; nombre_courriers: number; montant_total: number } | null>(null);
const erreurImpression = ref('');

async function ouvrirFinDeCaisse() {
    if (!session.agenceId) return;
    rapportFinDeCaisse.value = (await window.api.courrier.finDeCaisse(session.agenceId, dateFiltre.value)) as {
        date: string;
        nombre_courriers: number;
        montant_total: number;
    };
    finDeCaisseOuvert.value = true;
}

async function imprimerFinDeCaisse() {
    erreurImpression.value = '';
    await nextTick();
    const impression = await window.api.impression.imprimerRecu();
    if (!impression.ok) {
        erreurImpression.value = impression.erreur ?? "L'impression n'a pas pu être lancée.";
    }
}

const formatMontant = (m: number) => new Intl.NumberFormat('fr-FR').format(m) + ' FCFA';
</script>

<template>
    <AppSidebarLayout titre="Courrier">
        <div class="flex flex-col gap-5">
            <div class="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 class="flex items-center gap-2 text-xl font-semibold"><Send class="size-5" /> Courrier</h1>
                    <p class="text-[0.95rem] text-muted-foreground">Suivez les courriers du jour et envoyez-en un nouveau</p>
                </div>

                <div class="flex items-center gap-2">
                    <Input v-model="dateFiltre" type="date" class="h-10 w-44 text-base" />
                    <Button variant="outline" :disabled="!session.agenceId" @click="ouvrirFinDeCaisse">
                        <ClipboardList />
                        Fin de caisse
                    </Button>
                    <Button :disabled="!session.agenceId" @click="ouvrir">
                        <Plus />
                        Envoyer un courrier
                    </Button>
                </div>
            </div>

            <div class="overflow-hidden rounded-lg border bg-card p-5 shadow-sm">
                <div class="mb-3 flex items-center justify-between">
                    <p class="text-base font-medium">Courriers du {{ dateFiltre === aujourdhui() ? 'jour' : dateFiltre }}</p>
                    <span class="text-lg font-semibold">Total : {{ formatMontant(totalDuJour) }}</span>
                </div>

                <Input v-model="recherche" placeholder="Rechercher : n° courrier, destinataire, expéditeur, téléphone…" class="mb-3 h-10 max-w-md text-base" />

                <p v-if="courriersAffiches.length === 0" class="rounded-md bg-muted/40 px-4 py-6 text-center text-[0.95rem] text-muted-foreground">{{ recherche ? 'Aucun résultat pour cette recherche.' : 'Aucun courrier pour cette date.' }}</p>

                <table v-else class="w-full text-[0.95rem]">
                    <thead class="bg-muted/40">
                        <tr class="border-b text-left text-muted-foreground">
                            <th class="px-3 py-3 font-medium">Heure</th>
                            <th class="px-3 py-3 font-medium">N°</th>
                            <th class="px-3 py-3 font-medium">Destination</th>
                            <th class="px-3 py-3 font-medium">Destinataire</th>
                            <th class="px-3 py-3 text-right font-medium">Montant</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="c in courriersAffiches" :key="c.uuid" class="border-b last:border-0 hover:bg-muted/30">
                            <td class="px-3 py-3">{{ c.heure }}</td>
                            <td class="px-3 py-3 font-mono">{{ c.numero_courrier }}</td>
                            <td class="px-3 py-3">{{ c.destination }}</td>
                            <td class="px-3 py-3">{{ c.destinataire }}</td>
                            <td class="px-3 py-3 text-right font-semibold">{{ formatMontant(c.montant_total) }}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>

        <Dialog v-model:open="dialogOuvert">
            <!-- Hauteur fixe + overflow-hidden : header et footer restent visibles,
                 seul le corps du formulaire défile. -->
            <DialogContent class="flex h-[90vh] w-[92vw] max-w-5xl flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
                <DialogHeader class="shrink-0 border-b bg-background px-6 py-4">
                    <DialogTitle class="flex items-center gap-2"><Send class="size-5" /> Envoyer un courrier</DialogTitle>
                </DialogHeader>
                <CourrierForm ref="courrierForm" @enregistre="onEnregistre" @fermer="dialogOuvert = false" />
            </DialogContent>
        </Dialog>

        <Dialog v-model:open="finDeCaisseOuvert">
            <DialogContent class="sm:max-w-sm">
                <DialogHeader>
                    <DialogTitle class="flex items-center gap-2"><ClipboardList class="size-5" /> Fin de caisse — {{ dateFiltre }}</DialogTitle>
                </DialogHeader>
                <div v-if="rapportFinDeCaisse" class="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                    <span>{{ rapportFinDeCaisse.nombre_courriers }} courrier(s)</span>
                    <span class="text-lg font-semibold">{{ formatMontant(rapportFinDeCaisse.montant_total) }}</span>
                </div>
                <DialogFooter>
                    <Button variant="outline" @click="finDeCaisseOuvert = false">Fermer</Button>
                    <Button @click="imprimerFinDeCaisse"><Printer /> Imprimer</Button>
                </DialogFooter>
                <p v-if="erreurImpression" class="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {{ erreurImpression }}
                </p>
            </DialogContent>
        </Dialog>

        <div class="zone-impression hidden print:block">
            <FinDeCaisseSimpleRecu
                v-if="finDeCaisseOuvert && rapportFinDeCaisse"
                titre="FIN DE CAISSE — COURRIER"
                :agence="config.agence ? `${config.agence.nom} — ${config.agence.ville_nom}` : ''"
                :caissier="session.nom"
                :date="rapportFinDeCaisse.date"
                libelle-compteur="Nombre de courriers"
                :nombre="rapportFinDeCaisse.nombre_courriers"
                :montant-total="rapportFinDeCaisse.montant_total"
            />
        </div>
    </AppSidebarLayout>
</template>
