<script setup lang="ts">
import { ref, watch } from 'vue';
import { CloudDownload, LoaderCircle } from '@lucide/vue';
import { toast } from 'vue-sonner';
import { Button } from '@/Components/ui/button';
import { Input } from '@/Components/ui/input';
import { Label } from '@/Components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/Components/ui/dialog';
import { useSessionStore } from '@/Stores/session';
import { useConfigStore } from '@/Stores/config';

const props = defineProps<{ section: 'ticket' | 'bagage' | 'courrier' | 'courrier_international'; date: string }>();
const emit = defineEmits<{ recupere: [] }>();
const session = useSessionStore();
const config = useConfigStore();
const ouvert = ref(false);
const enCours = ref(false);
const password = ref('');
const dateDemandee = ref('');
const erreur = ref('');
const libelles = { ticket: 'tickets', bagage: 'bagages', courrier: 'courriers', courrier_international: 'courriers internationaux' };
watch(ouvert, () => { password.value = ''; erreur.value = ''; });

function ouvrir() {
    dateDemandee.value = props.date;
    ouvert.value = true;
}
async function recuperer() {
    if (enCours.value || session.role !== 'super_admin' || !session.userId || !password.value) return;
    enCours.value = true;
    erreur.value = '';
    const demande = { section: props.section, date: dateDemandee.value, userId: session.userId, password: password.value };
    password.value = '';
    try {
        const resultat = await window.api.config.recupererDepuisAdmin(demande);
        const table = { ticket: 'tickets', bagage: 'bagages', courrier: 'courriers', courrier_international: 'courriers_internationaux' }[props.section];
        const ajoutes = resultat.ajoutes[table] ?? 0;
        const lots = resultat.ajoutes.lots_bordereaux ?? 0;
        toast.success(`${ajoutes} vente(s) et ${lots} lot(s) récupérés. ${resultat.existants[table] ?? 0} vente(s) déjà présentes conservées.`);
        ouvert.value = false;
        emit('recupere');
    } catch (error) {
        erreur.value = error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '') : 'La récupération a échoué. Réessayez.';
    } finally {
        demande.password = '';
        enCours.value = false;
    }
}
</script>

<template>
    <template v-if="session.role === 'super_admin'">
        <Button variant="outline" :disabled="enCours || !session.agenceId || !date" :aria-busy="enCours" @click="ouvrir">
            <LoaderCircle v-if="enCours" class="size-4 animate-spin" /><CloudDownload v-else class="size-4" />
            Récupérer les ventes
        </Button>
        <Dialog :open="ouvert" @update:open="value => { if (!enCours) ouvert = value; }">
            <DialogContent :show-close-button="!enCours" class="max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Récupérer les {{ libelles[section] }}</DialogTitle>
                    <DialogDescription>{{ config.agence?.nom }} · {{ dateDemandee.split('-').reverse().join('/') }}</DialogDescription>
                </DialogHeader>
                <p class="text-sm">Les ventes sauvegardées dans admin seront ajoutées sur cet ordinateur. Les données déjà présentes restent inchangées.</p>
                <p v-if="section !== 'ticket'" class="text-sm text-muted-foreground">Les lots, bordereaux et leurs envois liés seront également récupérés, même si certains envois datent d’un autre jour.</p>
                <form class="grid gap-4" @submit.prevent="recuperer">
                    <div class="grid gap-2">
                        <Label :for="`recovery-password-${section}`">Votre mot de passe super administrateur</Label>
                        <Input :id="`recovery-password-${section}`" v-model="password" type="password" autocomplete="current-password" :disabled="enCours" required />
                    </div>
                    <p v-if="erreur" role="alert" class="text-sm text-destructive">{{ erreur }}</p>
                    <DialogFooter>
                        <Button type="button" variant="outline" :disabled="enCours" @click="ouvert = false">Annuler</Button>
                        <Button type="submit" :disabled="enCours || !password" :aria-busy="enCours">
                            <LoaderCircle v-if="enCours" class="size-4 animate-spin" /><CloudDownload v-else class="size-4" />
                            {{ enCours ? 'Récupération en cours…' : 'Confirmer la récupération' }}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    </template>
</template>
