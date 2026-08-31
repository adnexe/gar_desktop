<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';
import { CheckCircle2, Eye, EyeOff, KeyRound, LoaderCircle, ShieldCheck, UserRound, WifiOff } from '@lucide/vue';
import AppSidebarLayout from '@/Layouts/app/AppSidebarLayout.vue';
import { Button } from '@/Components/ui/button';
import { Input } from '@/Components/ui/input';
import { Label } from '@/Components/ui/label';

type Profil = Awaited<ReturnType<Window['api']['auth']['profil']>>;
const profil = ref<Profil | null>(null);
const chargement = ref(true);
const enCours = ref(false);
const enLigne = ref(navigator.onLine);
const erreur = ref('');
const succes = ref('');
const currentPassword = ref('');
const password = ref('');
const confirmation = ref('');
const visibles = ref({ actuel: false, nouveau: false, confirmation: false });
const role = computed(() => ({ super_admin: 'Super administrateur', admin: 'Administrateur', chef_gare: 'Chef de gare', agent: 'Agent', caissiere: 'Caissière' }[profil.value?.role ?? ''] ?? 'Utilisateur'));
const modules = computed(() => (profil.value?.type_agent?.split(',') ?? []).map(m => ({ ticket: 'Tickets', bagage: 'Bagages', courrier: 'Courrier national', courrier_international: 'Courrier international' }[m] ?? m)));
const formulaireComplet = computed(() => currentPassword.value && password.value && confirmation.value);

function viderSecrets() {
    currentPassword.value = '';
    password.value = '';
    confirmation.value = '';
    visibles.value = { actuel: false, nouveau: false, confirmation: false };
}

function messageErreur(error: unknown) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('No handler registered') || message.includes('is not a function')) {
        return 'Quittez complètement l’application puis relancez-la pour activer la page Profil. Si nécessaire, installez la dernière mise à jour.';
    }
    return message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '') || 'La modification n’a pas pu être confirmée. Vérifiez votre connexion.';
}

async function charger() {
    chargement.value = true;
    erreur.value = '';
    try { profil.value = await window.api.auth.profil(); }
    catch (error) { erreur.value = messageErreur(error); }
    finally { chargement.value = false; }
}

async function modifier() {
    if (enCours.value || !profil.value) return;
    erreur.value = '';
    succes.value = '';
    if (!enLigne.value) {
        erreur.value = 'Une connexion Internet est nécessaire pour modifier votre mot de passe.';
        return;
    }
    if (Array.from(password.value).length < 8 || new TextEncoder().encode(password.value).length > 72 || password.value.includes('\0')) {
        erreur.value = 'Choisissez un mot de passe de 8 caractères minimum, sans dépasser 72 octets.';
        return;
    }
    if (password.value !== confirmation.value) {
        erreur.value = 'La confirmation ne correspond pas au nouveau mot de passe.';
        return;
    }
    if (password.value === currentPassword.value) {
        erreur.value = 'Le nouveau mot de passe doit être différent du mot de passe actuel.';
        return;
    }
    enCours.value = true;
    const demande = { currentPassword: currentPassword.value, password: password.value, confirmation: confirmation.value };
    viderSecrets();
    try {
        await window.api.auth.modifierMotDePasse(demande);
        succes.value = 'Votre mot de passe a été modifié dans admin et sur cet ordinateur.';
    } catch (error) { erreur.value = messageErreur(error); }
    finally {
        demande.currentPassword = ''; demande.password = ''; demande.confirmation = '';
        enCours.value = false;
    }
}

function actualiserConnexion() { enLigne.value = navigator.onLine; }
onMounted(() => {
    void charger();
    window.addEventListener('online', actualiserConnexion);
    window.addEventListener('offline', actualiserConnexion);
});
onUnmounted(() => {
    viderSecrets();
    window.removeEventListener('online', actualiserConnexion);
    window.removeEventListener('offline', actualiserConnexion);
});
onBeforeRouteLeave(() => {
    viderSecrets();
});
</script>

<template>
    <AppSidebarLayout titre="Profil">
        <div class="mx-auto w-full max-w-5xl space-y-8">
            <header class="flex items-center gap-3">
                <UserRound class="size-7 shrink-0 text-sky-600 dark:text-sky-400" />
                <h1 class="text-2xl font-semibold">Mon profil</h1>
            </header>
            <div v-if="chargement" role="status" class="flex items-center gap-2 py-8 text-muted-foreground">
                <LoaderCircle class="size-5 animate-spin" /> Chargement du profil…
            </div>
            <template v-else-if="profil">
                <section class="grid gap-5 border-b pb-8 md:grid-cols-[14rem_minmax(0,1fr)]">
                    <div><h2 class="text-lg font-semibold">Mon compte</h2></div>
                    <dl class="grid min-w-0 gap-x-8 gap-y-5 sm:grid-cols-2">
                        <div class="min-w-0"><dt class="text-sm text-muted-foreground">Nom</dt><dd class="mt-1 break-words font-medium">{{ profil.nom || profil.agent_nom || 'Non renseigné' }}</dd></div>
                        <div><dt class="text-sm text-muted-foreground">Rôle</dt><dd class="mt-1 font-medium">{{ role }}</dd></div>
                        <div class="min-w-0"><dt class="text-sm text-muted-foreground">Téléphone</dt><dd class="mt-1 break-words font-medium">{{ profil.telephone || 'Non renseigné' }}</dd></div>
                        <div class="min-w-0"><dt class="text-sm text-muted-foreground">Adresse e-mail</dt><dd class="mt-1 break-all font-medium">{{ profil.email || 'Non renseignée' }}</dd></div>
                        <div class="min-w-0"><dt class="text-sm text-muted-foreground">Agence</dt><dd class="mt-1 break-words font-medium">{{ profil.agence_nom || 'Compte global' }}</dd></div>
                        <div v-if="modules.length" class="min-w-0"><dt class="text-sm text-muted-foreground">Activités</dt><dd class="mt-1 break-words font-medium">{{ modules.join(' · ') }}</dd></div>
                    </dl>
                </section>
                <section class="grid gap-5 md:grid-cols-[14rem_minmax(0,1fr)]">
                    <div class="flex items-start gap-2"><ShieldCheck class="mt-0.5 size-5 shrink-0 text-emerald-600 dark:text-emerald-400" /><h2 class="text-lg font-semibold">Mot de passe</h2></div>
                    <form class="min-w-0 max-w-xl space-y-5" :aria-busy="enCours" @submit.prevent="modifier">
                        <p v-if="!enLigne" role="status" class="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400"><WifiOff class="size-5 shrink-0" />Connexion Internet nécessaire.</p>
                        <div class="space-y-2">
                            <Label for="profil-password-actuel">Mot de passe actuel</Label>
                            <div class="relative">
                                <Input id="profil-password-actuel" v-model="currentPassword" :type="visibles.actuel ? 'text' : 'password'" autocomplete="current-password" required :disabled="enCours" class="h-11 pr-12" />
                                <Button type="button" variant="ghost" size="icon" class="absolute right-1 top-0.5 size-10" :disabled="enCours" :aria-label="visibles.actuel ? 'Masquer le mot de passe actuel' : 'Afficher le mot de passe actuel'" :title="visibles.actuel ? 'Masquer' : 'Afficher'" @click="visibles.actuel = !visibles.actuel"><EyeOff v-if="visibles.actuel" class="size-4" /><Eye v-else class="size-4" /></Button>
                            </div>
                        </div>
                        <div class="space-y-2">
                            <Label for="profil-password-nouveau">Nouveau mot de passe</Label>
                            <div class="relative">
                                <Input id="profil-password-nouveau" v-model="password" :type="visibles.nouveau ? 'text' : 'password'" autocomplete="new-password" minlength="8" required :disabled="enCours" class="h-11 pr-12" aria-describedby="profil-password-regle" />
                                <Button type="button" variant="ghost" size="icon" class="absolute right-1 top-0.5 size-10" :disabled="enCours" :aria-label="visibles.nouveau ? 'Masquer le nouveau mot de passe' : 'Afficher le nouveau mot de passe'" :title="visibles.nouveau ? 'Masquer' : 'Afficher'" @click="visibles.nouveau = !visibles.nouveau"><EyeOff v-if="visibles.nouveau" class="size-4" /><Eye v-else class="size-4" /></Button>
                            </div>
                            <p id="profil-password-regle" class="text-sm text-muted-foreground">8 caractères minimum.</p>
                        </div>
                        <div class="space-y-2">
                            <Label for="profil-password-confirmation">Confirmer le nouveau mot de passe</Label>
                            <div class="relative">
                                <Input id="profil-password-confirmation" v-model="confirmation" :type="visibles.confirmation ? 'text' : 'password'" autocomplete="new-password" required :disabled="enCours" class="h-11 pr-12" />
                                <Button type="button" variant="ghost" size="icon" class="absolute right-1 top-0.5 size-10" :disabled="enCours" :aria-label="visibles.confirmation ? 'Masquer la confirmation' : 'Afficher la confirmation'" :title="visibles.confirmation ? 'Masquer' : 'Afficher'" @click="visibles.confirmation = !visibles.confirmation"><EyeOff v-if="visibles.confirmation" class="size-4" /><Eye v-else class="size-4" /></Button>
                            </div>
                        </div>
                        <p v-if="erreur" role="alert" class="text-sm text-destructive">{{ erreur }}</p>
                        <p v-if="succes" role="status" class="flex items-start gap-2 text-sm text-emerald-700 dark:text-emerald-400"><CheckCircle2 class="size-5 shrink-0" />{{ succes }}</p>
                        <Button type="submit" class="h-auto min-h-11 w-full whitespace-normal sm:w-auto" :disabled="enCours || !enLigne || !formulaireComplet">
                            <LoaderCircle v-if="enCours" class="size-4 shrink-0 animate-spin" /><KeyRound v-else class="size-4 shrink-0" />
                            {{ enCours ? 'Modification en cours…' : 'Modifier mon mot de passe' }}
                        </Button>
                    </form>
                </section>
            </template>
            <div v-else class="space-y-4"><p role="alert" class="text-destructive">{{ erreur }}</p><Button variant="outline" @click="charger">Réessayer</Button></div>
        </div>
    </AppSidebarLayout>
</template>
