<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { Button } from '@/Components/ui/button';
import { Input } from '@/Components/ui/input';
import { Label } from '@/Components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/Components/ui/select';
import { useConfigStore } from '@/Stores/config';

interface Itineraire { id: number; uuid: string; nom: string | null; ville_depart_nom: string; ville_arrivee_nom: string }
interface Chauffeur { id: number; uuid: string; nom: string }
interface Vehicule { id: number; uuid: string; immatriculation: string; nombre_places: number }
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

// Le parent force un remontage (via :key) à chaque ouverture du dialog : les
// champs ci-dessous s'initialisent une seule fois, directement depuis la prop
// `voyage` (édition) ou vides (création) — pas de timing à gérer entre
// l'ouverture du dialog et le préremplissage.
const props = defineProps<{
    voyage?: VoyageEdition | null;
}>();

const emit = defineEmits<{
    enregistre: [];
    fermer: [];
}>();

const config = useConfigStore();

const itineraires = ref<Itineraire[]>([]);
const chauffeurs = ref<Chauffeur[]>([]);
const vehicules = ref<Vehicule[]>([]);
const statuts = ref<string[]>(['programme', 'embarquement', 'parti', 'termine', 'annule']);

const dateDuJour = () => new Date().toISOString().slice(0, 10);
const modeEdition = computed(() => !!props.voyage);

const itineraireId = ref<number | null>(props.voyage?.itineraire_id ?? null);
const vehiculeId = ref<number | null>(props.voyage?.vehicule_id ?? null);
const chauffeurId = ref<number | null>(props.voyage?.chauffeur_id ?? null);
const dateDepart = ref(props.voyage?.date_depart.slice(0, 10) ?? dateDuJour());
const heureDepart = ref(props.voyage?.heure_depart.slice(0, 5) ?? '08:00');
const numeroDepart = ref(props.voyage?.numero_depart ?? 1);
const statut = ref(props.voyage?.statut ?? 'programme');

const enCours = ref(false);
const erreur = ref('');

onMounted(async () => {
    if (!config.agence) return;
    const data = (await window.api.voyage.formulaire(config.agence.id)) as {
        itineraires: Itineraire[];
        chauffeurs: Chauffeur[];
        vehicules: Vehicule[];
        statuts: string[];
    };
    itineraires.value = data.itineraires;
    chauffeurs.value = data.chauffeurs;
    vehicules.value = data.vehicules;
    if (data.statuts?.length) statuts.value = data.statuts;
});

async function enregistrer() {
    if (!config.agence || !itineraireId.value || !vehiculeId.value) return;

    enCours.value = true;
    erreur.value = '';

    try {
        if (!modeEdition.value && dateDepart.value < dateDuJour()) {
            erreur.value = "Impossible de créer un voyage à une date déjà passée.";
            return;
        }

        if (modeEdition.value && props.voyage) {
            // Volontairement restreint à véhicule / chauffeur / statut : un
            // voyage identifie une vente, l'itinéraire et l'horaire ne se
            // changent pas après coup (voir ModificationVoyage côté main).
            const resultat = await window.api.voyage.modifier(props.voyage.uuid, {
                vehiculeId: vehiculeId.value,
                chauffeurId: chauffeurId.value,
                statut: statut.value,
            }) as { ok?: boolean; erreur?: string } | undefined;
            if (resultat?.ok === false) {
                erreur.value = resultat.erreur ?? 'La modification du voyage a échoué.';
                return;
            }
        } else {
            const resultat = await window.api.voyage.creer({
                agenceId: config.agence.id,
                itineraireId: itineraireId.value,
                vehiculeId: vehiculeId.value,
                chauffeurId: chauffeurId.value,
                dateDepart: dateDepart.value,
                heureDepart: heureDepart.value,
                numeroDepart: numeroDepart.value,
                statut: statut.value,
            }) as { ok?: boolean; erreur?: string } | undefined;
            if (resultat?.ok === false) {
                erreur.value = resultat.erreur ?? 'La création du voyage a échoué.';
                return;
            }
        }

        emit('enregistre');
    } catch (e) {
        erreur.value = e instanceof Error && e.message.includes('DATE_VOYAGE_PASSEE')
            ? "Impossible de créer un voyage à une date déjà passée."
            : `La ${modeEdition.value ? 'modification' : 'création'} du voyage a échoué.`;
    } finally {
        enCours.value = false;
    }
}
</script>

<template>
    <div class="flex flex-col gap-4 p-6">
        <p v-if="modeEdition" class="rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
            L'itinéraire, la date, l'heure et le n° de départ ne sont plus modifiables une fois le voyage créé (les
            places vendues s'y rattachent). Seuls le véhicule, le chauffeur et le statut peuvent changer.
        </p>

        <div class="space-y-1.5">
            <Label>Itinéraire</Label>
            <Select v-model="itineraireId" :disabled="modeEdition">
                <SelectTrigger class="w-full"><SelectValue placeholder="Choisir un itinéraire" /></SelectTrigger>
                <SelectContent>
                    <SelectItem v-for="i in itineraires" :key="i.id" :value="i.id">
                        {{ i.nom ?? `${i.ville_depart_nom} → ${i.ville_arrivee_nom}` }}
                    </SelectItem>
                </SelectContent>
            </Select>
        </div>

        <div class="space-y-1.5">
            <Label>Véhicule</Label>
            <Select v-model="vehiculeId">
                <SelectTrigger class="w-full"><SelectValue placeholder="Choisir un véhicule" /></SelectTrigger>
                <SelectContent>
                    <SelectItem v-for="v in vehicules" :key="v.id" :value="v.id">{{ v.immatriculation }} ({{ v.nombre_places }} places)</SelectItem>
                </SelectContent>
            </Select>
        </div>

        <div class="space-y-1.5">
            <Label>Chauffeur (facultatif)</Label>
            <Select v-model="chauffeurId">
                <SelectTrigger class="w-full"><SelectValue placeholder="Aucun" /></SelectTrigger>
                <SelectContent>
                    <SelectItem v-for="c in chauffeurs" :key="c.id" :value="c.id">{{ c.nom }}</SelectItem>
                </SelectContent>
            </Select>
        </div>

        <div class="grid grid-cols-3 gap-4">
            <div class="space-y-1.5">
                <Label>Date</Label>
                <Input v-model="dateDepart" type="date" :min="modeEdition ? undefined : dateDuJour()" :disabled="modeEdition" />
            </div>
            <div class="space-y-1.5">
                <Label>Heure</Label>
                <Input v-model="heureDepart" type="time" :disabled="modeEdition" />
            </div>
            <div class="space-y-1.5">
                <Label>N° départ</Label>
                <Input v-model.number="numeroDepart" type="number" min="1" :disabled="modeEdition" />
            </div>
        </div>

        <div class="space-y-1.5">
            <Label>Statut</Label>
            <Select v-model="statut">
                <SelectTrigger class="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                    <SelectItem v-for="s in statuts" :key="s" :value="s">{{ STATUT_LABELS[s] ?? s }}</SelectItem>
                </SelectContent>
            </Select>
        </div>

        <p v-if="erreur" class="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{{ erreur }}</p>

        <div class="flex justify-end gap-2">
            <Button variant="outline" @click="emit('fermer')">Fermer</Button>
            <Button :disabled="enCours || !itineraireId || !vehiculeId" @click="enregistrer">
                {{ enCours ? 'Enregistrement…' : (modeEdition ? 'Enregistrer les modifications' : 'Créer le voyage') }}
            </Button>
        </div>
    </div>
</template>
