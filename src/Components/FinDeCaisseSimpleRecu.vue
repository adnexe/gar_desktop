<script setup lang="ts">
defineProps<{
    titre: string;
    agence: string;
    caissier: string;
    date: string;
    libelleCompteur: string;
    nombre: number;
    montantTotal: number;
    /** Libellé du voyage quand la fin de caisse ne concerne qu'un seul départ. */
    voyage?: string;
    /** Agents responsables des ventes du périmètre. */
    agents?: string[];
    lignes?: { id: number | null; libelle: string; nombre: number; montant_total: number; complement?: string }[];
    /** Lignes récapitulatives supplémentaires (valeur déclarée, nb colis…). */
    details?: { libelle: string; valeur: string }[];
}>();

const formatMontant = (m: number) => new Intl.NumberFormat('fr-FR').format(m) + ' FCFA';
</script>

<template>
    <div class="ticket-recu" style="width: var(--impression-largeur-contenu, 70mm); margin: 0">
        <p class="text-center font-bold">{{ agence }}</p>
        <p class="text-center font-bold">{{ titre }}</p>
        <hr />
        <div style="display:flex;justify-content:space-between"><span>Date</span><span>{{ date }}</span></div>
        <div style="display:flex;justify-content:space-between"><span>Caissier</span><span>{{ caissier }}</span></div>
        <div v-if="agents?.length" style="display:flex;justify-content:space-between;gap:8px">
            <span>Agent(s)</span><span style="text-align:right">{{ agents.join(', ') }}</span>
        </div>
        <p v-if="voyage" style="font-weight: 700">{{ voyage }}</p>
        <hr />
        <template v-if="lignes?.length">
            <div v-for="ligne in lignes" :key="ligne.id ?? ligne.libelle" style="margin-bottom: 4px">
                <p style="font-weight: 700">{{ ligne.libelle }}</p>
                <div style="display:flex;justify-content:space-between">
                    <span>{{ ligne.nombre }}</span>
                    <span>{{ formatMontant(ligne.montant_total) }}</span>
                </div>
                <p v-if="ligne.complement" style="font-size: 11px">{{ ligne.complement }}</p>
            </div>
            <hr />
        </template>
        <div style="display:flex;justify-content:space-between"><span>{{ libelleCompteur }}</span><span>{{ nombre }}</span></div>
        <template v-if="details?.length">
            <div v-for="d in details" :key="d.libelle" style="display:flex;justify-content:space-between">
                <span>{{ d.libelle }}</span><span>{{ d.valeur }}</span>
            </div>
        </template>
        <div style="display:flex;justify-content:space-between;font-weight:700"><span>Montant total</span><span>{{ formatMontant(montantTotal) }}</span></div>
    </div>
</template>

<style scoped>
/* !important nécessaire : une règle globale (app.css) force overflow-wrap:
 * anywhere + word-break: break-word sur tout span du reçu, pour ne jamais
 * dépasser la zone imprimable. Sur une étiquette longue, ça coupe en plein
 * milieu d'un mot dès que la place manque. keep-all autorise toujours le
 * retour à la ligne (entre les mots), juste plus jamais en plein milieu
 * d'un mot. Ciblage par attribut (comme app.css) : ce composant n'a que des
 * styles inline, pas de classe dédiée sur les lignes label/valeur. */
div[style*="justify-content:space-between"] > span:first-child {
    overflow-wrap: normal !important;
    word-break: keep-all !important;
}
</style>
