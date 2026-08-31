<script setup lang="ts">
import { computed } from 'vue';
import type { AgenceLocale, CompagnieLocale } from '@/Stores/config';
import type { FormatBordereau } from '@/lib/impressionA4';

export interface LigneBordereauCourrier {
    uuid: string;
    numero_courrier: string;
    destination: string;
    expediteur_nom: string;
    expediteur_telephone: string;
    destinataire_nom: string;
    destinataire_telephone: string;
    montant_total: number;
    colis: { nom: string; quantite: number }[];
}

export interface LigneBordereauBagage {
    uuid: string;
    numero_bagage: string;
    numero_ticket: string | null;
    destination: string | null;
    client: string | null;
    client_telephone: string | null;
    description: string | null;
    valeur: number | null;
    montant: number;
}

const props = withDefaults(defineProps<{
    type: 'courrier' | 'bagage' | 'courrier_international';
    date: string;
    agence: AgenceLocale | null;
    compagnie: CompagnieLocale | null;
    courriers?: LigneBordereauCourrier[];
    bagages?: LigneBordereauBagage[];
    numeroLot?: number | null;
    referenceLot?: string | null;
    voyage?: string | null;
    format?: FormatBordereau;
}>(), {
    courriers: () => [],
    bagages: () => [],
    numeroLot: null,
    referenceLot: null,
    voyage: null,
    format: 'a4',
});

const lignes = computed(() => props.type === 'bagage' ? props.bagages : props.courriers);
const destinations = computed(() => {
    const valeurs = lignes.value
        .map((ligne) => ligne.destination?.trim())
        .filter((destination): destination is string => !!destination);

    return [...new Set(valeurs)];
});
const destination = computed(() => {
    if (destinations.value.length === 0) return 'Destination non renseignée';
    if (destinations.value.length === 1) return destinations.value[0];
    return 'Plusieurs destinations';
});
const reference = computed(() => {
    const prefixe = props.type === 'courrier' ? 'BC' : props.type === 'courrier_international' ? 'BI' : 'BB';
    const agence = (props.agence?.reference || 'AGENCE').replace(/[^A-Z0-9]/gi, '').toUpperCase();
    return `${prefixe}-${agence}-${props.date.replaceAll('-', '')}`;
});
const titre = computed(() => props.type === 'courrier'
    ? 'Bordereau de livraison'
    : props.type === 'courrier_international' ? 'Bordereau de livraison internationale' : 'Bordereau des bagages');
const nomCompagnie = computed(() => props.compagnie?.nom?.trim() || '');
const logoSrc = computed(() => props.compagnie?.logo_data_uri || props.compagnie?.logo_url || null);
const total = computed(() => props.type === 'bagage'
    ? props.bagages.reduce((somme, ligne) => somme + ligne.montant, 0)
    : props.courriers.reduce((somme, ligne) => somme + ligne.montant_total, 0));
const nombreColis = computed(() => props.courriers.reduce(
    (somme, ligne) => somme + ligne.colis.reduce((total, colis) => total + colis.quantite, 0),
    0,
));

function formatMontant(montant: number | null): string {
    return montant === null ? '—' : `${new Intl.NumberFormat('fr-FR').format(montant)} FCFA`;
}

function formatDate(date: string): string {
    const [annee, mois, jour] = date.split('-');
    return annee && mois && jour ? `${jour}/${mois}/${annee}` : date;
}

function contenuCourrier(ligne: LigneBordereauCourrier): string {
    if (ligne.colis.length === 0) return '—';
    return ligne.colis
        .map((colis) => `${colis.quantite > 1 ? `${colis.quantite} x ` : ''}${colis.nom}`)
        .join(', ');
}

function masquerLogo(event: Event): void {
    (event.currentTarget as HTMLImageElement).style.display = 'none';
}
</script>

<template>
    <div class="zone-impression-a4" aria-hidden="true">
        <article class="bordereau-a4" :class="{ 'bordereau-pos': format === 'pos' }">
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
                    <span v-if="numeroLot">LOT N° {{ numeroLot }}</span>
                    <span v-else>Référence</span>
                    <strong>{{ referenceLot || reference }}</strong>
                </div>
            </header>

            <section class="bordereau-meta">
                <div><span>Agence de départ</span><strong>{{ agence?.nom || '—' }}</strong></div>
                <div><span>Trajet</span><strong>{{ agence?.ville_nom || '—' }} → {{ destination }}</strong><small v-if="voyage">{{ voyage }}</small></div>
                <div><span>Date</span><strong>{{ formatDate(date) }}</strong></div>
            </section>

            <table v-if="format === 'a4' && type !== 'bagage'" class="bordereau-table">
                <thead>
                    <tr>
                        <th class="col-index">#</th>
                        <th class="col-reference">Réf.</th>
                        <th>Expéditeur</th>
                        <th>Destinataire</th>
                        <th>Contenu</th>
                        <th class="col-montant">Frais d'expédition</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="(ligne, index) in courriers" :key="ligne.uuid">
                        <td>{{ index + 1 }}</td>
                        <td class="reference-cell">{{ ligne.numero_courrier }}</td>
                        <td><strong>{{ ligne.expediteur_nom || '—' }}</strong><br>{{ ligne.expediteur_telephone || '—' }}</td>
                        <td><strong>{{ ligne.destinataire_nom || '—' }}</strong><br>{{ ligne.destinataire_telephone || '—' }}</td>
                        <td>{{ contenuCourrier(ligne) }}</td>
                        <td class="montant-cell">{{ formatMontant(ligne.montant_total) }}</td>
                    </tr>
                </tbody>
            </table>

            <table v-else-if="format === 'a4'" class="bordereau-table">
                <thead>
                    <tr>
                        <th class="col-index">#</th>
                        <th class="col-reference">N° bagage</th>
                        <th>N° ticket</th>
                        <th>Client</th>
                        <th>Destination</th>
                        <th>Contenu</th>
                        <th class="col-montant">Frais</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="(ligne, index) in bagages" :key="ligne.uuid">
                        <td>{{ index + 1 }}</td>
                        <td class="reference-cell">{{ ligne.numero_bagage }}</td>
                        <td>{{ ligne.numero_ticket || '—' }}</td>
                        <td><strong>{{ ligne.client || 'Client anonyme' }}</strong><br>{{ ligne.client_telephone || '—' }}</td>
                        <td>{{ ligne.destination || '—' }}</td>
                        <td>{{ ligne.description || '—' }}<br><span v-if="ligne.valeur !== null">Valeur : {{ formatMontant(ligne.valeur) }}</span></td>
                        <td class="montant-cell">{{ formatMontant(ligne.montant) }}</td>
                    </tr>
                </tbody>
            </table>

            <section v-else class="bordereau-pos-liste">
                <template v-if="type !== 'bagage'">
                    <section v-for="(ligne, index) in courriers" :key="ligne.uuid" class="bordereau-pos-element">
                        <h2>{{ index + 1 }}. {{ ligne.numero_courrier }}</h2>
                        <dl>
                            <div><dt>Expéditeur</dt><dd><strong>{{ ligne.expediteur_nom || '—' }}</strong><span>{{ ligne.expediteur_telephone || '—' }}</span></dd></div>
                            <div><dt>Destinataire</dt><dd><strong>{{ ligne.destinataire_nom || '—' }}</strong><span>{{ ligne.destinataire_telephone || '—' }}</span></dd></div>
                            <div><dt>Destination</dt><dd>{{ ligne.destination || destination }}</dd></div>
                            <div><dt>Contenu</dt><dd>{{ contenuCourrier(ligne) }}</dd></div>
                            <div><dt>Frais d’expédition</dt><dd><strong>{{ formatMontant(ligne.montant_total) }}</strong></dd></div>
                        </dl>
                    </section>
                </template>
                <template v-else>
                    <section v-for="(ligne, index) in bagages" :key="ligne.uuid" class="bordereau-pos-element">
                        <h2>{{ index + 1 }}. {{ ligne.numero_bagage }}</h2>
                        <dl>
                            <div><dt>N° ticket</dt><dd>{{ ligne.numero_ticket || '—' }}</dd></div>
                            <div><dt>Client</dt><dd><strong>{{ ligne.client || 'Client anonyme' }}</strong><span>{{ ligne.client_telephone || '—' }}</span></dd></div>
                            <div><dt>Destination</dt><dd>{{ ligne.destination || '—' }}</dd></div>
                            <div><dt>Contenu</dt><dd>{{ ligne.description || '—' }}</dd></div>
                            <div v-if="ligne.valeur !== null"><dt>Valeur</dt><dd>{{ formatMontant(ligne.valeur) }}</dd></div>
                            <div><dt>Frais</dt><dd><strong>{{ formatMontant(ligne.montant) }}</strong></dd></div>
                        </dl>
                    </section>
                </template>
            </section>

            <footer class="bordereau-pied">
                <strong v-if="type !== 'bagage'">{{ lignes.length }} courrier(s) · {{ nombreColis }} colis</strong>
                <strong v-else>{{ lignes.length }} bagage(s)</strong>
                <span>Total : <strong>{{ formatMontant(total) }}</strong></span>
            </footer>
        </article>
    </div>
</template>
