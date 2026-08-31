<script setup lang="ts">
import { computed } from 'vue';
import type { AgenceLocale, CompagnieLocale } from '@/Stores/config';
import type { LotResume, StatutLot, TypeLot } from '@/types/lot';
import type { FormatBordereau } from '@/lib/impressionA4';

const props = withDefaults(defineProps<{
    type: TypeLot;
    date: string;
    lots: LotResume[];
    agence: AgenceLocale | null;
    compagnie: CompagnieLocale | null;
    format?: FormatBordereau;
}>(), { format: 'a4' });

const titre = computed(() => props.type === 'courrier'
    ? 'État des bordereaux de livraison'
    : props.type === 'courrier_international'
        ? 'État des bordereaux internationaux'
        : 'État des bordereaux de bagages');
const libelleType = computed(() => props.type === 'courrier'
    ? 'Livraison'
    : props.type === 'courrier_international' ? 'International' : 'Bagages');
const nomCompagnie = computed(() => props.compagnie?.nom?.trim() || '');
const logoSrc = computed(() => props.compagnie?.logo_data_uri || props.compagnie?.logo_url || null);
const nombreElements = computed(() => props.lots.reduce((total, lot) => total + lot.nombre_elements, 0));
const montantTotal = computed(() => props.lots.reduce((total, lot) => total + lot.montant_total, 0));

const statutLibelle: Record<StatutLot, string> = {
    en_preparation: 'En préparation',
    expedie: 'Expédié',
    arrive: 'Arrivé',
    livre: 'Livré',
};

function formatMontant(montant: number): string {
    return `${new Intl.NumberFormat('fr-FR').format(montant)} FCFA`;
}

function formatDate(date: string): string {
    const [annee, mois, jour] = date.slice(0, 10).split('-');
    return annee && mois && jour ? `${jour}/${mois}/${annee}` : date;
}

function libelleAcheminement(lot: LotResume): string {
    if (lot.voyage_libelle) return lot.voyage_libelle;
    return lot.type === 'courrier_international' ? 'International' : 'Sans voyage';
}

function masquerLogo(event: Event): void {
    (event.currentTarget as HTMLImageElement).style.display = 'none';
}
</script>

<template>
    <div class="zone-impression-a4" aria-hidden="true">
        <article class="bordereau-a4 etat-lots-a4" :class="{ 'bordereau-pos': format === 'pos' }">
            <header class="bordereau-entete">
                <div class="bordereau-identite">
                    <img v-if="logoSrc" :src="logoSrc" alt="" class="bordereau-logo" @error="masquerLogo">
                    <div>
                        <p v-if="nomCompagnie" class="bordereau-compagnie">{{ nomCompagnie }}</p>
                        <h1>{{ titre }}</h1>
                        <p v-if="compagnie?.telephone">Tél. {{ compagnie.telephone }}</p>
                    </div>
                </div>
                <div class="bordereau-reference">
                    <span>Période</span>
                    <strong>{{ formatDate(date) }}</strong>
                    <small>{{ lots.length }} lot(s)</small>
                </div>
            </header>

            <section class="bordereau-meta">
                <div><span>Agence</span><strong>{{ agence?.nom || '—' }}</strong></div>
                <div><span>Ville</span><strong>{{ agence?.ville_nom || '—' }}</strong></div>
                <div><span>Type</span><strong>{{ libelleType }}</strong></div>
            </section>

            <table v-if="format === 'a4'" class="bordereau-table etat-lots-table">
                <thead>
                    <tr>
                        <th class="col-index">#</th>
                        <th class="col-lot">Lot</th>
                        <th class="col-reference">Référence</th>
                        <th>Destination / acheminement</th>
                        <th class="col-statut">Statut</th>
                        <th class="col-agent">Créé par</th>
                        <th class="col-elements">Éléments</th>
                        <th class="col-montant">Total</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="(lot, index) in lots" :key="lot.uuid">
                        <td>{{ index + 1 }}</td>
                        <td class="lot-cell">N° {{ lot.numero_lot }}</td>
                        <td class="reference-cell">{{ lot.reference }}</td>
                        <td><strong>{{ lot.destination }}</strong><small>{{ libelleAcheminement(lot) }}</small></td>
                        <td>{{ statutLibelle[lot.statut] }}</td>
                        <td>{{ lot.cree_par || '—' }}</td>
                        <td class="elements-cell">{{ lot.nombre_elements }}</td>
                        <td class="montant-cell">{{ formatMontant(lot.montant_total) }}</td>
                    </tr>
                </tbody>
            </table>

            <section v-else class="bordereau-pos-liste">
                <section v-for="(lot, index) in lots" :key="lot.uuid" class="bordereau-pos-element">
                    <h2>{{ index + 1 }}. LOT N° {{ lot.numero_lot }}</h2>
                    <p class="bordereau-pos-reference">{{ lot.reference }}</p>
                    <dl>
                        <div><dt>Destination</dt><dd><strong>{{ lot.destination }}</strong></dd></div>
                        <div><dt>Acheminement</dt><dd>{{ libelleAcheminement(lot) }}</dd></div>
                        <div><dt>Statut</dt><dd>{{ statutLibelle[lot.statut] }}</dd></div>
                        <div><dt>Créé par</dt><dd>{{ lot.cree_par || '—' }}</dd></div>
                        <div><dt>Éléments</dt><dd>{{ lot.nombre_elements }}</dd></div>
                        <div><dt>Total</dt><dd><strong>{{ formatMontant(lot.montant_total) }}</strong></dd></div>
                    </dl>
                </section>
            </section>

            <footer class="bordereau-pied etat-lots-pied">
                <strong>{{ lots.length }} lot(s)</strong>
                <span>{{ nombreElements }} élément(s)</span>
                <span>Total : <strong>{{ formatMontant(montantTotal) }}</strong></span>
            </footer>
        </article>
    </div>
</template>

<style scoped>
.bordereau-reference small,
.etat-lots-table small {
    display: block;
    margin-top: 1mm;
    color: #555;
    font-size: 8pt;
}

.etat-lots-table {
    font-size: 8.3pt;
}

.etat-lots-table .col-lot {
    width: 14mm;
}

.etat-lots-table .col-reference {
    width: 29mm;
}

.etat-lots-table .col-statut {
    width: 21mm;
}

.etat-lots-table .col-agent {
    width: 20mm;
}

.etat-lots-table .col-elements {
    width: 15mm;
}

.etat-lots-table .col-montant {
    width: 25mm;
}

.lot-cell,
.elements-cell {
    font-weight: 700;
    text-align: center;
}

.etat-lots-pied {
    justify-content: space-between;
}
</style>
