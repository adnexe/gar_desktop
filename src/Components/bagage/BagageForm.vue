<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import { Check, Printer, Search, X } from '@lucide/vue';
import { Button } from '@/Components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/Components/ui/dialog';
import { Input } from '@/Components/ui/input';
import { Label } from '@/Components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/Components/ui/select';
import BagageRecu from '@/Components/bagage/BagageRecu.vue';
import { useConfigStore, type CompagnieLocale } from '@/Stores/config';
import { hauteurZoneImpressionMm } from '@/lib/impression';
import { useSessionStore } from '@/Stores/session';
import type { BagageDuJour } from '@/types/bagage';

interface Ville { id: number; uuid: string; nom: string }
interface VoyageOption { id: number; uuid: string; date_depart: string; heure_depart: string; itineraire_nom: string | null }

interface TicketTrouve {
    id: number;
    uuid: string;
    numero_ticket: string;
    voyage_id: number;
    voyage_uuid: string;
    numero_place: number;
    trajet_nom: string | null;
    client_nom: string | null;
    client_prenoms: string | null;
    client_telephone: string | null;
    ville_depart_nom: string;
    ville_arrivee_id: number;
    ville_arrivee_nom: string;
    date_depart: string;
    heure_depart: string;
}

const emit = defineEmits<{
    enregistre: [bagage: BagageDuJour];
    fermer: [];
}>();

const config = useConfigStore();
const session = useSessionStore();

const code = ref('');
const ticket = ref<TicketTrouve | null>(null);
const rechercheEffectuee = ref(false);

const villes = ref<Ville[]>([]);
const villeArriveeId = ref<number | null>(null);
const voyagesAgence = ref<VoyageOption[]>([]);
const voyageId = ref<number | null>(null);

const montant = ref<number | null>(null);
const valeur = ref<number | null>(null);
const description = ref('');
const erreur = ref('');
const enCours = ref(false);
const recu = ref<{
    numero_bagage: string;
    numero_ticket: string | null;
    numero_place: number | null;
    reference: string;
    destination: string | null;
    voyage: string | null;
    client: string | null;
    valeur: number | null;
    montant: number;
    description: string | null;
    agence: string | null;
    agent: string | null;
    created_at: string;
    compagnie: CompagnieLocale | null;
} | null>(null);
const modeImpression = ref<'recu' | 'talon'>('recu');
const confirmationOuverte = ref(false);
let intervalleVoyages: ReturnType<typeof setInterval> | null = null;

const destinationNom = computed(() => villes.value.find((v) => v.id === villeArriveeId.value)?.nom ?? null);
const voyageSelectionne = computed(() => voyagesAgence.value.find((v) => v.id === voyageId.value) ?? null);
const formatMontant = (m: number) => new Intl.NumberFormat('fr-FR').format(m) + ' FCFA';

const clientNomComplet = computed(() =>
    ticket.value ? `${ticket.value.client_prenoms ?? ''} ${ticket.value.client_nom ?? ''}`.trim() || 'Client anonyme' : '',
);

async function chargerVoyagesAgence() {
    if (!config.agence) {
        voyagesAgence.value = [];
        return;
    }

    try {
        await window.api.config.actualiserVoyagesServeurLocal(config.agence.id);
        voyagesAgence.value = await window.api.referentiel.voyagesDeAgence(config.agence.id);
    } catch {
        // En mode client, une coupure LAN ne doit pas vider la liste déjà chargée.
    }
}

onMounted(async () => {
    villes.value = await window.api.referentiel.villes();
    await chargerVoyagesAgence();
    intervalleVoyages = setInterval(() => {
        void chargerVoyagesAgence();
    }, 15000);
});

onUnmounted(() => {
    if (intervalleVoyages) {
        clearInterval(intervalleVoyages);
    }
});

async function rechercher() {
    erreur.value = '';
    rechercheEffectuee.value = true;
    villeArriveeId.value = null;
    voyageId.value = null;
    ticket.value = null;

    try {
        ticket.value = (await window.api.bagage.rechercherTicket(code.value.trim())) as TicketTrouve | null;
    } catch (e) {
        erreur.value = messageErreurInconnue(e, 'Impossible de synchroniser les tickets avec la caisse serveur.');
        return;
    }

    if (!ticket.value) {
        erreur.value = 'Aucun ticket ne correspond à ce code.';
        return;
    }

    villeArriveeId.value = ticket.value.ville_arrivee_id;
    voyageId.value = ticket.value.voyage_id;
}

function libelleVoyage(v: VoyageOption) {
    return `${v.date_depart} ${v.heure_depart} · ${v.itineraire_nom ?? ''}`;
}

function dateHeureRecu() {
    return new Date().toLocaleString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function voyageRecu() {
    if (ticket.value) {
        return `${ticket.value.date_depart} à ${ticket.value.heure_depart}`;
    }

    const voyage = voyagesAgence.value.find((v) => v.id === voyageId.value);
    return voyage ? libelleVoyage(voyage) : null;
}

function resetSaisie() {
    code.value = '';
    ticket.value = null;
    rechercheEffectuee.value = false;
    villeArriveeId.value = null;
    voyageId.value = null;
    montant.value = null;
    valeur.value = null;
    description.value = '';
    erreur.value = '';
    confirmationOuverte.value = false;
}

function resetTout() {
    resetSaisie();
    recu.value = null;
    modeImpression.value = 'recu';
    void chargerVoyagesAgence();
}

defineExpose({ resetTout });

type ResultatImpression = { ok: boolean; erreur?: string };

function messageErreurInconnue(e: unknown, defaut: string) {
    if (!(e instanceof Error)) return defaut;

    return e.message
        .replace(/^Error invoking remote method '[^']+': Error: /, '')
        .replace(/^Error invoking remote method "[^"]+": Error: /, '');
}

async function lancerImpression(): Promise<ResultatImpression> {
    await nextTick();
    return await window.api.impression.imprimerRecu(hauteurZoneImpressionMm());
}

async function imprimerRecu(): Promise<ResultatImpression> {
    modeImpression.value = 'recu';
    return await lancerImpression();
}

async function imprimerTalon() {
    if (!recu.value) return;

    erreur.value = '';
    modeImpression.value = 'talon';

    try {
        const impression = await lancerImpression();
        if (!impression.ok) {
            erreur.value = `Talon non imprimé : ${impression.erreur ?? 'Impression non confirmée par le système.'}`;
        }
    } catch (e) {
        erreur.value = `Talon non imprimé : ${messageErreurInconnue(e, "L'impression n'a pas pu être lancée.")}`;
    }
}

async function enregistrer() {
    if (!config.agence || !session.userId || montant.value === null) return;

    enCours.value = true;
    erreur.value = '';
    const agenceActuelle = config.agence;
    const userId = session.userId;
    const montantActuel = montant.value;

    try {
        const reponse = (await window.api.bagage.enregistrer({
            agenceId: agenceActuelle.id,
            code: code.value.trim() || null,
            ticketUuid: ticket.value?.uuid ?? null,
            ticketNumero: ticket.value?.numero_ticket ?? null,
            villeArriveeId: villeArriveeId.value,
            voyageId: voyageId.value,
            voyageUuid: ticket.value?.voyage_uuid ?? voyageSelectionne.value?.uuid ?? null,
            userId,
            agentId: session.agentId,
            description: description.value || null,
            valeur: valeur.value,
            montant: montantActuel,
        })) as { ok: boolean; bagage?: { uuid: string; numero_bagage: string }; erreur?: string };

        if (!reponse.ok || !reponse.bagage) {
            erreur.value = reponse.erreur ?? "L'enregistrement a échoué.";
            confirmationOuverte.value = false;
            return;
        }

        confirmationOuverte.value = false;

        const reference = ticket.value ? `Ticket ${ticket.value.numero_ticket}` : 'Sans ticket';
        const destination = villes.value.find((v) => v.id === villeArriveeId.value)?.nom ?? null;
        const dernierRecu = {
            numero_bagage: reponse.bagage.numero_bagage,
            numero_ticket: ticket.value?.numero_ticket ?? null,
            numero_place: ticket.value?.numero_place ?? null,
            reference,
            destination,
            voyage: voyageRecu(),
            client: clientNomComplet.value || null,
            valeur: valeur.value,
            montant: montantActuel,
            description: description.value || null,
            agence: agenceActuelle.nom,
            agent: session.nom || null,
            created_at: dateHeureRecu(),
            compagnie: config.compagnie,
        };
        recu.value = dernierRecu;

        let impression: ResultatImpression;
        try {
            impression = await imprimerRecu();
        } catch (e) {
            impression = {
                ok: false,
                erreur: messageErreurInconnue(e, "L'impression n'a pas pu être lancée."),
            };
        }

        if (!impression.ok) {
            const motif = impression.erreur ?? 'Impression non confirmée par le système.';
            recu.value = null;

            try {
                await window.api.bagage.annulerImpression(reponse.bagage.uuid, motif);
                erreur.value = `Bagage ${reponse.bagage.numero_bagage} annulé : ${motif}. La vente n'est pas comptabilisée.`;
            } catch (e) {
                erreur.value = `Impression non confirmée pour le bagage ${reponse.bagage.numero_bagage}, mais l'annulation automatique a échoué : ${messageErreurInconnue(e, motif)}. Vérifiez avant de continuer.`;
            }

            return;
        }

        const confirmation = await window.api.bagage.confirmerImpression(reponse.bagage.uuid);
        if (!confirmation.ok) {
            erreur.value = confirmation.erreur
                ?? `Le reçu bagage ${reponse.bagage.numero_bagage} a peut-être été imprimé, mais la validation locale a échoué. Vérifiez avant de continuer.`;
            return;
        }

        emit('enregistre', {
            uuid: reponse.bagage.uuid,
            numero_bagage: reponse.bagage.numero_bagage,
            heure: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
            numero_ticket: dernierRecu.numero_ticket,
            destination,
            description: dernierRecu.description,
            valeur: dernierRecu.valeur,
            montant: dernierRecu.montant,
        });

        resetSaisie();
    } catch (e) {
        erreur.value = messageErreurInconnue(e, "Une erreur est survenue lors de l'enregistrement.");
        confirmationOuverte.value = false;
    } finally {
        enCours.value = false;
    }
}
</script>

<template>
    <div class="flex flex-col gap-5 p-6">
        <div class="rounded-xl border p-5">
            <p class="mb-2 text-base font-semibold">Rechercher un ticket <span class="font-normal text-muted-foreground">(facultatif)</span></p>
            <div class="flex gap-2">
                <Input v-model="code" placeholder="Numéro de ticket" class="h-10 text-base" autofocus @keyup.enter="rechercher" />
                <Button variant="outline" @click="rechercher"><Search class="size-4" /> Rechercher</Button>
            </div>
            <p v-if="rechercheEffectuee && !ticket" class="mt-2 text-sm text-destructive">Aucun ticket ne correspond à ce code.</p>

            <div v-if="ticket" class="mt-3 grid grid-cols-2 gap-3 rounded-lg border bg-muted/30 p-3 text-sm sm:grid-cols-4">
                <div>
                    <p class="text-muted-foreground">Client</p>
                    <p class="font-medium">{{ clientNomComplet }}</p>
                </div>
                <div>
                    <p class="text-muted-foreground">Destination</p>
                    <p class="font-medium">{{ ticket.ville_depart_nom }} → {{ ticket.ville_arrivee_nom }}</p>
                </div>
                <div>
                    <p class="text-muted-foreground">Voyage</p>
                    <p class="font-medium">{{ ticket.date_depart }} à {{ ticket.heure_depart }}</p>
                </div>
                <div>
                    <p class="text-muted-foreground">Place</p>
                    <p class="font-medium">N° {{ ticket.numero_place }}</p>
                </div>
            </div>
        </div>

        <div class="rounded-xl border p-5">
            <p class="mb-3 text-base font-semibold">Destination et voyage</p>
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div class="space-y-1.5">
                    <Label>Destination</Label>
                    <Select v-model="villeArriveeId">
                        <SelectTrigger class="h-10 w-full"><SelectValue placeholder="Choisir une ville" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem v-for="v in villes" :key="v.id" :value="v.id">{{ v.nom }}</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div class="space-y-1.5">
                    <Label>Voyage de départ</Label>
                    <Select v-model="voyageId">
                        <SelectTrigger class="h-10 w-full"><SelectValue placeholder="Aucun voyage précis" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem v-for="v in voyagesAgence" :key="v.id" :value="v.id">{{ libelleVoyage(v) }}</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>
        </div>

        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div class="space-y-1.5">
                <Label>Valeur déclarée (FCFA)</Label>
                <Input v-model.number="valeur" type="number" min="0" step="50" class="h-10 text-base" />
            </div>
            <div class="space-y-1.5">
                <Label>Montant à payer</Label>
                <Input v-model.number="montant" type="number" min="0" class="h-10 text-base" />
            </div>
            <div class="space-y-1.5 sm:col-span-2">
                <Label>Description du contenu (facultatif)</Label>
                <Input v-model="description" class="h-10 text-base" />
            </div>
        </div>

        <p v-if="erreur" class="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{{ erreur }}</p>

        <div v-if="recu" class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
            <div>
                <p class="text-sm font-semibold">Dernier bagage enregistré : {{ recu.numero_bagage }}</p>
                <p class="text-sm text-muted-foreground">
                    {{ recu.numero_ticket ? `Ticket ${recu.numero_ticket}` : 'Sans ticket' }}
                    <span v-if="recu.destination"> · {{ recu.destination }}</span>
                </p>
            </div>
            <Button variant="outline" @click="imprimerTalon">
                <Printer />
                Imprimer talon
            </Button>
        </div>

        <div class="flex justify-end gap-2 border-t pt-4">
            <Button variant="outline" @click="emit('fermer')">Fermer</Button>
            <Button :disabled="montant === null || enCours" @click="confirmationOuverte = true">
                {{ enCours ? 'Enregistrement…' : 'Enregistrer et imprimer' }}
            </Button>
        </div>
    </div>

    <!-- Confirmation avant d'enregistrer : récapitulatif du montant encaissé. -->
    <Dialog v-model:open="confirmationOuverte">
        <DialogContent class="sm:max-w-md">
            <DialogHeader>
                <DialogTitle>Confirmer l'enregistrement du bagage ?</DialogTitle>
                <DialogDescription>Vérifiez les informations avant d'imprimer le reçu.</DialogDescription>
            </DialogHeader>

            <div class="space-y-1.5 rounded-lg border bg-muted/30 p-3 text-sm">
                <div class="flex justify-between">
                    <span class="text-muted-foreground">Ticket</span>
                    <span class="font-medium">{{ ticket ? ticket.numero_ticket : 'Sans ticket' }}</span>
                </div>
                <div v-if="destinationNom" class="flex justify-between">
                    <span class="text-muted-foreground">Destination</span>
                    <span class="font-medium">{{ destinationNom }}</span>
                </div>
                <div v-if="description" class="flex justify-between">
                    <span class="text-muted-foreground">Contenu</span>
                    <span class="font-medium">{{ description }}</span>
                </div>
                <div v-if="valeur !== null" class="flex justify-between">
                    <span class="text-muted-foreground">Valeur déclarée</span>
                    <span class="font-medium">{{ formatMontant(valeur) }}</span>
                </div>
                <div class="flex justify-between border-t pt-1.5">
                    <span class="font-medium">Montant à encaisser</span>
                    <span class="text-lg font-bold">{{ formatMontant(montant ?? 0) }}</span>
                </div>
            </div>

            <DialogFooter class="gap-2">
                <Button variant="outline" @click="confirmationOuverte = false">
                    <X />
                    Fermer
                </Button>
                <Button :disabled="enCours" @click="enregistrer">
                    <Check />
                    Confirmer
                </Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>

    <div class="zone-impression hidden print:block">
        <BagageRecu v-if="recu" :recu="recu" :mode="modeImpression" />
    </div>
</template>
