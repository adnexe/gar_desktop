<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { CalendarDays, RefreshCw } from '@lucide/vue';
import { SidebarTrigger } from '@/Components/ui/sidebar';
import { Badge } from '@/Components/ui/badge';
import ThemeToggle from '@/Components/ThemeToggle.vue';
import { useConfigStore } from '@/Stores/config';

defineProps<{ titre?: string }>();

const config = useConfigStore();

// Mise à jour prête : installée automatiquement à la prochaine fermeture de
// l'app (jamais en pleine vente) — juste un signe discret pour rassurer.
const miseAJourPrete = ref<string | null>(null);
let desabonnerMiseAJour: (() => void) | null = null;

onMounted(() => {
    desabonnerMiseAJour = window.api.miseAJour.surMiseAJourPrete((version) => {
        miseAJourPrete.value = version;
    });
});
onUnmounted(() => desabonnerMiseAJour?.());

const joursAbonnementRestants = computed(() => {
    if (!config.licence?.date_expiration) return null;

    return differenceEnJours(dateDuJourIso(), config.licence.date_expiration);
});
const etatAbonnement = computed(() => {
    if (!config.licence) return 'aucune';
    if (!config.licence.actif || config.licence.statut === 'desactivee') return 'desactive';
    if (config.licence.statut === 'expiree' || (joursAbonnementRestants.value ?? -1) < 0) return 'expire';
    if ((joursAbonnementRestants.value ?? 99) <= 7) return 'bientot';

    return 'actif';
});
const libelleAbonnementNavbar = computed(() => {
    if (etatAbonnement.value === 'aucune') return 'Aucune licence';
    if (etatAbonnement.value === 'desactive') return 'Abonnement désactivé';
    if (etatAbonnement.value === 'expire') return 'Abonnement expiré';

    const jours = joursAbonnementRestants.value;
    if (jours === null || Number.isNaN(jours)) return 'Abonnement';
    if (jours === 0) return "Expire aujourd'hui";
    if (jours === 1) return 'Expire demain';

    return `Abonnement ${jours.toLocaleString('fr-FR')} j`;
});
const titreAbonnement = computed(() => {
    if (!config.licence) return "Aucune licence locale n'est enregistrée.";

    return `${libelleAbonnementNavbar.value} · fin le ${formatDate(config.licence.date_expiration)}`;
});
const classeAbonnement = computed(() => [
    'rounded-md px-3 py-1.5 text-sm font-semibold',
    etatAbonnement.value === 'actif'
        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
        : etatAbonnement.value === 'bientot'
            ? 'border-amber-200 bg-amber-50 text-amber-700'
            : etatAbonnement.value === 'expire'
                ? 'border-red-200 bg-red-50 text-red-700'
                : 'border-muted bg-muted text-muted-foreground',
]);

function dateDuJourIso() {
    const maintenant = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');

    return `${maintenant.getFullYear()}-${pad(maintenant.getMonth() + 1)}-${pad(maintenant.getDate())}`;
}

function dateVersUtc(date: string) {
    const [annee, mois, jour] = date.slice(0, 10).split('-').map(Number);

    return Date.UTC(annee, mois - 1, jour);
}

function differenceEnJours(debut: string, fin: string) {
    return Math.floor((dateVersUtc(fin) - dateVersUtc(debut)) / 86_400_000);
}

function formatDate(date: string | null | undefined) {
    if (!date) return 'non définie';

    const [annee, mois, jour] = date.slice(0, 10).split('-').map(Number);
    if (!annee || !mois || !jour) return date;

    return new Intl.DateTimeFormat('fr-FR').format(new Date(annee, mois - 1, jour));
}
</script>

<template>
    <header
        class="sticky top-0 z-30 flex h-[68px] shrink-0 items-center gap-3 border-b border-sidebar-border/70 bg-background/95 px-6 backdrop-blur transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-14"
    >
        <div class="flex items-center gap-2">
            <SidebarTrigger class="-ml-1" />
            <span v-if="titre" class="text-base font-semibold text-foreground">{{ titre }}</span>
        </div>
        <div class="ml-auto flex min-w-0 items-center gap-2">
            <Badge
                v-if="miseAJourPrete"
                variant="outline"
                class="rounded-md border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm text-emerald-700"
                :title="`Version ${miseAJourPrete} téléchargée — s'installera au prochain redémarrage de l'app.`"
            >
                <RefreshCw class="size-4" />
                <span class="hidden sm:inline">Mise à jour prête</span>
            </Badge>
            <Badge v-if="config.licence" variant="outline" :class="classeAbonnement" :title="titreAbonnement">
                <CalendarDays class="size-4" />
                <span>{{ libelleAbonnementNavbar }}</span>
                <span class="hidden text-xs font-medium opacity-80 xl:inline">
                    Fin {{ formatDate(config.licence.date_expiration) }}
                </span>
            </Badge>
            <Badge v-if="config.agence" variant="outline" class="hidden max-w-[18rem] rounded-md px-3 py-1.5 text-sm md:inline-flex">
                <span class="truncate">{{ config.agence.nom }} — {{ config.agence.ville_nom }}</span>
            </Badge>
            <ThemeToggle />
        </div>
    </header>
</template>
