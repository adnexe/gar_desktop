<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { BusFront, CalendarClock, ClipboardList, MapPin, Plus, Printer, Users } from '@lucide/vue';
import BordereauConvoiA4 from '@/Components/convoi/BordereauConvoiA4.vue';
import FinDeCaisseConvoiA4 from '@/Components/convoi/FinDeCaisseConvoiA4.vue';
import AppSidebarLayout from '@/Layouts/app/AppSidebarLayout.vue';
import { Badge } from '@/Components/ui/badge';
import { Button } from '@/Components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/Components/ui/dialog';
import { Input } from '@/Components/ui/input';
import { Label } from '@/Components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/Components/ui/select';
import { Spinner } from '@/Components/ui/spinner';
import { useConfigStore } from '@/Stores/config';
import { useSessionStore } from '@/Stores/session';
import { imprimerBordereauA4 } from '@/lib/impressionA4';
import type { Convoi } from '@/types/convoi';

type Ville = { id: number; uuid: string; nom: string };
const config = useConfigStore();
const session = useSessionStore();
const dateLocale = () => { const d = new Date(); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
const dateFiltre = ref(dateLocale());
const convois = ref<Convoi[]>([]);
const villes = ref<Ville[]>([]);
const chargement = ref(false);
const creation = ref(false);
const impressionUuid = ref<string | null>(null);
const erreur = ref('');
const dialogOuvert = ref(false);
const convoiImpression = ref<Convoi | null>(null);
const convoiFinDeCaisseImpression = ref<Convoi | null>(null);
const formulaire = ref({ villeDestinationId: null as number | null, precisionDestination: '', nombrePlaces: 1, montantFixe: 0, dateDepart: dateLocale(), heureDepart: '08:00', dateRetour: dateLocale(), heureRetour: '' });

const peutCreer = computed(() => session.role === 'super_admin' || (
    session.role === 'agent'
    && session.agentRole === 'caissiere'
    && session.peutModule('ticket')
));
const totalPlaces = computed(() => convois.value.reduce((total, item) => total + item.nombre_places, 0));
const totalMontant = computed(() => convois.value.reduce((total, item) => total + item.montant_fixe, 0));
const formatMontant = (montant: number) => `${new Intl.NumberFormat('fr-FR').format(montant)} FCFA`;
const formatDate = (date: string) => date.split('-').reverse().join('/');

async function charger() {
    if (!config.agence?.id || !session.userId) return;
    chargement.value = true; erreur.value = '';
    try {
        const reponse = await window.api.convoi.liste(config.agence.id, dateFiltre.value, session.userId);
        if (!reponse.ok) throw new Error(reponse.erreur);
        convois.value = (reponse.data ?? []) as Convoi[];
    } catch (e) { erreur.value = e instanceof Error ? e.message : 'Impossible de charger les convois.'; }
    finally { chargement.value = false; }
}

function ouvrirCreation() {
    const dateDepart = dateFiltre.value || dateLocale();
    formulaire.value = { villeDestinationId: null, precisionDestination: '', nombrePlaces: 1, montantFixe: 0, dateDepart, heureDepart: '08:00', dateRetour: dateDepart, heureRetour: '' };
    erreur.value = ''; dialogOuvert.value = true;
}

async function creer() {
    if (!config.agence?.id || !session.userId || !formulaire.value.villeDestinationId) return;
    creation.value = true; erreur.value = '';
    try {
        const reponse = await window.api.convoi.creer({ agenceId: config.agence.id, userId: session.userId, ...formulaire.value });
        if (!reponse.ok) throw new Error(reponse.erreur);
        dialogOuvert.value = false;
        dateFiltre.value = formulaire.value.dateDepart;
        await charger();
    } catch (e) { erreur.value = e instanceof Error ? e.message : 'Impossible de créer le convoi.'; }
    finally { creation.value = false; }
}

async function imprimer(convoi: Convoi) {
    if (impressionUuid.value) return;
    impressionUuid.value = `bordereau:${convoi.uuid}`; erreur.value = '';
    try {
        await config.charger();
        convoiFinDeCaisseImpression.value = null;
        convoiImpression.value = { ...convoi };
        await nextTick();
        await imprimerBordereauA4();
    } catch (e) { erreur.value = e instanceof Error ? e.message : "L'impression du bordereau a échoué."; }
    finally { convoiImpression.value = null; impressionUuid.value = null; }
}

async function imprimerFinDeCaisse(convoi: Convoi) {
    if (impressionUuid.value) return;
    impressionUuid.value = `caisse:${convoi.uuid}`; erreur.value = '';
    try {
        await config.charger();
        convoiImpression.value = null;
        convoiFinDeCaisseImpression.value = { ...convoi };
        await nextTick();
        await imprimerBordereauA4();
    } catch (e) { erreur.value = e instanceof Error ? e.message : "L'impression de la fin de caisse a échoué."; }
    finally { convoiFinDeCaisseImpression.value = null; impressionUuid.value = null; }
}

watch(dateFiltre, () => void charger());
onMounted(async () => { await config.charger(); villes.value = await window.api.referentiel.villes(); await charger(); });
</script>

<template>
    <AppSidebarLayout titre="Convois">
    <div class="flex flex-col gap-6">
        <div class="flex flex-wrap items-end justify-between gap-3">
            <div><h1 class="text-2xl font-bold">Convois</h1><p class="text-muted-foreground">Déplacements spéciaux et bordereaux passagers</p></div>
            <div class="flex w-full flex-col gap-2 sm:w-auto sm:flex-row"><Input v-model="dateFiltre" type="date" class="sm:w-44" /><Button v-if="peutCreer" @click="ouvrirCreation"><Plus /> Créer un convoi</Button></div>
        </div>
        <p v-if="erreur" class="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{{ erreur }}</p>
        <div class="grid gap-3 sm:grid-cols-3">
            <div class="rounded-lg border p-4"><BusFront class="mb-2 size-5 text-blue-600" /><p class="text-sm text-muted-foreground">Convois</p><strong class="text-2xl">{{ convois.length }}</strong></div>
            <div class="rounded-lg border p-4"><Users class="mb-2 size-5 text-emerald-600" /><p class="text-sm text-muted-foreground">Places prévues</p><strong class="text-2xl">{{ totalPlaces }}</strong></div>
            <div class="rounded-lg border p-4"><CalendarClock class="mb-2 size-5 text-amber-600" /><p class="text-sm text-muted-foreground">Montant fixé</p><strong class="text-2xl">{{ formatMontant(totalMontant) }}</strong></div>
        </div>
        <div v-if="chargement" class="flex min-h-48 items-center justify-center gap-2 text-muted-foreground"><Spinner /> Chargement…</div>
        <div v-else-if="convois.length === 0" class="rounded-lg border border-dashed p-10 text-center text-muted-foreground">Aucun convoi programmé pour cette date.</div>
        <div v-else class="grid gap-3">
            <article v-for="convoi in convois" :key="convoi.uuid" class="grid gap-4 rounded-lg border p-4 shadow-sm md:grid-cols-[1.1fr_1.5fr_0.7fr_0.8fr_auto] md:items-center">
                <div><p class="font-mono text-xs text-muted-foreground">{{ convoi.reference }}</p><strong>{{ formatDate(convoi.date_depart) }} à {{ convoi.heure_depart }}</strong></div>
                <div><p class="flex items-center gap-1 font-semibold"><MapPin class="size-4 text-blue-600" /> {{ convoi.destination }}</p><p class="break-words text-sm text-muted-foreground">{{ convoi.precision_destination }}</p></div>
                <div><p class="text-xs text-muted-foreground">Places</p><strong>{{ convoi.nombre_places }}</strong></div>
                <div><p class="text-xs text-muted-foreground">Montant fixé</p><strong>{{ formatMontant(convoi.montant_fixe) }}</strong></div>
                <div class="flex flex-wrap items-center justify-between gap-2 md:justify-end"><Badge variant="outline">{{ convoi.statut }}</Badge><Button size="sm" variant="outline" title="Imprimer le bordereau passagers" :disabled="!!impressionUuid" @click="imprimer(convoi)"><Spinner v-if="impressionUuid === `bordereau:${convoi.uuid}`" /><Printer v-else /> Bordereau</Button><Button size="sm" variant="outline" title="Imprimer la fin de caisse du convoi" :disabled="!!impressionUuid" @click="imprimerFinDeCaisse(convoi)"><Spinner v-if="impressionUuid === `caisse:${convoi.uuid}`" /><ClipboardList v-else /> Fin de caisse</Button></div>
            </article>
        </div>
    </div>

    <Dialog v-model:open="dialogOuvert">
        <DialogContent class="max-h-[90vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>Créer un convoi</DialogTitle></DialogHeader>
            <form class="grid gap-4 sm:grid-cols-2" @submit.prevent="creer">
                <div class="grid gap-2"><Label>Destination</Label><Select v-model="formulaire.villeDestinationId"><SelectTrigger class="w-full"><SelectValue placeholder="Choisir la destination" /></SelectTrigger><SelectContent><SelectItem v-for="ville in villes" :key="ville.id" :value="ville.id">{{ ville.nom }}</SelectItem></SelectContent></Select></div>
                <div class="grid gap-2"><Label>Lieu précis</Label><Input v-model="formulaire.precisionDestination" required placeholder="Village, quartier, lieu de rendez-vous…" /></div>
                <div class="grid gap-2"><Label>Nombre de places</Label><Input v-model.number="formulaire.nombrePlaces" required type="number" min="1" max="200" /></div>
                <div class="grid gap-2"><Label>Montant fixé (FCFA)</Label><Input v-model.number="formulaire.montantFixe" required type="number" min="0" step="1" /></div>
                <div class="grid gap-2"><Label>Date de départ</Label><Input v-model="formulaire.dateDepart" required type="date" :min="dateLocale()" /></div>
                <div class="grid gap-2"><Label>Heure de départ</Label><Input v-model="formulaire.heureDepart" required type="time" /></div>
                <div class="grid gap-2"><Label>Date de retour</Label><Input v-model="formulaire.dateRetour" required type="date" :min="formulaire.dateDepart" /></div>
                <div class="grid gap-2"><Label>Heure de retour <span class="text-muted-foreground">(facultatif)</span></Label><Input v-model="formulaire.heureRetour" type="time" /></div>
                <DialogFooter class="sm:col-span-2"><Button type="button" variant="outline" @click="dialogOuvert = false">Annuler</Button><Button type="submit" :disabled="creation || !formulaire.villeDestinationId"><Spinner v-if="creation" /><Plus v-else /> {{ creation ? 'Création…' : 'Créer le convoi' }}</Button></DialogFooter>
            </form>
        </DialogContent>
    </Dialog>
    <BordereauConvoiA4 v-if="convoiImpression" :convoi="convoiImpression" :agence="config.agence" :compagnie="config.compagnie" />
    <FinDeCaisseConvoiA4 v-if="convoiFinDeCaisseImpression" :convoi="convoiFinDeCaisseImpression" :agence="config.agence" :compagnie="config.compagnie" />
    </AppSidebarLayout>
</template>
