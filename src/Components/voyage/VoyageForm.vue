<script setup lang="ts">
import { onMounted, ref } from 'vue';
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

const emit = defineEmits<{
    cree: [];
    fermer: [];
}>();

const config = useConfigStore();

const itineraires = ref<Itineraire[]>([]);
const chauffeurs = ref<Chauffeur[]>([]);
const vehicules = ref<Vehicule[]>([]);

const dateDuJour = () => new Date().toISOString().slice(0, 10);
const itineraireId = ref<number | null>(null);
const vehiculeId = ref<number | null>(null);
const chauffeurId = ref<number | null>(null);
const dateDepart = ref(dateDuJour());
const heureDepart = ref('08:00');
const numeroDepart = ref(1);

const enCours = ref(false);
const erreur = ref('');

onMounted(async () => {
    if (!config.agence) return;
    const data = (await window.api.voyage.formulaire(config.agence.id)) as {
        itineraires: Itineraire[];
        chauffeurs: Chauffeur[];
        vehicules: Vehicule[];
    };
    itineraires.value = data.itineraires;
    chauffeurs.value = data.chauffeurs;
    vehicules.value = data.vehicules;
});

function resetTout() {
    itineraireId.value = null;
    vehiculeId.value = null;
    chauffeurId.value = null;
    dateDepart.value = dateDuJour();
    heureDepart.value = '08:00';
    numeroDepart.value = 1;
    erreur.value = '';
}

defineExpose({ resetTout });

async function creer() {
    if (!config.agence || !itineraireId.value || !vehiculeId.value) return;

    enCours.value = true;
    erreur.value = '';

    try {
        if (dateDepart.value < dateDuJour()) {
            erreur.value = "Impossible de créer un voyage à une date déjà passée.";
            return;
        }

        const resultat = await window.api.voyage.creer({
            agenceId: config.agence.id,
            itineraireId: itineraireId.value,
            vehiculeId: vehiculeId.value,
            chauffeurId: chauffeurId.value,
            dateDepart: dateDepart.value,
            heureDepart: heureDepart.value,
            numeroDepart: numeroDepart.value,
        }) as { ok?: boolean; erreur?: string } | undefined;
        if (resultat?.ok === false) {
            erreur.value = resultat.erreur ?? 'La création du voyage a échoué.';
            return;
        }

        emit('cree');
        resetTout();
    } catch (e) {
        erreur.value = e instanceof Error && e.message.includes('DATE_VOYAGE_PASSEE')
            ? "Impossible de créer un voyage à une date déjà passée."
            : 'La création du voyage a échoué.';
    } finally {
        enCours.value = false;
    }
}
</script>

<template>
    <div class="flex flex-col gap-4 p-6">
        <div class="space-y-1.5">
            <Label>Itinéraire</Label>
            <Select v-model="itineraireId">
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
                <Input v-model="dateDepart" type="date" :min="dateDuJour()" />
            </div>
            <div class="space-y-1.5">
                <Label>Heure</Label>
                <Input v-model="heureDepart" type="time" />
            </div>
            <div class="space-y-1.5">
                <Label>N° départ</Label>
                <Input v-model.number="numeroDepart" type="number" min="1" />
            </div>
        </div>

        <p v-if="erreur" class="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{{ erreur }}</p>

        <div class="flex justify-end gap-2">
            <Button variant="outline" @click="emit('fermer')">Fermer</Button>
            <Button :disabled="enCours || !itineraireId || !vehiculeId" @click="creer">
                {{ enCours ? 'Création…' : 'Créer le voyage' }}
            </Button>
        </div>
    </div>
</template>
