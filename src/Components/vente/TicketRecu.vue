<script setup lang="ts">
export type CompagnieRecu = {
    nom: string | null;
    slogan: string | null;
    telephone: string | null;
    whatsapp: string | null;
    site_web: string | null;
    logo_url?: string | null;
    logo_data_uri?: string | null;
    pied_ticket: string | null;
};

export type Recu = {
    uuid: string;
    numero: string;
    numero_place: number;
    type_billet: string;
    tarification: string;
    montant: number;
    timbre: number;
    total: number;
    created_at: string;
    agence: string;
    ville_depart: string;
    ville_arrivee: string;
    date_depart: string;
    heure_depart: string;
    vehicule: string;
    client: string | null;
    vendeur: string;
    compagnie?: CompagnieRecu | null;
};

// `partie` permet d'imprimer le ticket et son talon en deux passages séparés :
// l'imprimante coupe le papier entre les deux jobs, le talon n'est plus collé.
withDefaults(defineProps<{
    recu: Recu | null;
    partie?: 'tout' | 'ticket' | 'talon';
}>(), { partie: 'tout' });

const typeLabel: Record<string, string> = {
    aller: 'Aller simple',
    aller_retour: 'Aller-retour',
};

const formatMontant = (montant: number) => new Intl.NumberFormat('fr-FR').format(montant) + ' FCFA';
</script>

<template>
    <template v-if="recu">
    <div v-if="partie !== 'talon'" class="ticket-recu ticket-principal">
        <div class="text-center">
            <img
                v-if="recu.compagnie?.logo_data_uri || recu.compagnie?.logo_url"
                :src="recu.compagnie.logo_data_uri || recu.compagnie.logo_url || ''"
                alt=""
                class="logo"
            />
            <p class="nom-agence">{{ recu.compagnie?.nom || recu.agence }}</p>
            <p v-if="recu.compagnie?.slogan" class="slogan">{{ recu.compagnie.slogan }}</p>
            <p v-if="recu.compagnie?.telephone || recu.compagnie?.whatsapp" class="contact">
                <span v-if="recu.compagnie?.telephone">Tél : {{ recu.compagnie.telephone }}</span>
                <span v-if="recu.compagnie?.telephone && recu.compagnie?.whatsapp"> · </span>
                <span v-if="recu.compagnie?.whatsapp">WhatsApp : {{ recu.compagnie.whatsapp }}</span>
            </p>
            <p v-if="recu.compagnie?.site_web" class="contact">{{ recu.compagnie.site_web }}</p>
            <p class="ligne-pointillee" />
        </div>

        <div v-if="recu.compagnie?.nom" class="ligne">
            <span>Agence</span>
            <span>{{ recu.agence }}</span>
        </div>

        <div class="numero-encadre">
            <span>N°</span>
            <strong>{{ recu.numero }}</strong>
        </div>
        <div class="ligne">
            <span>Émis le</span>
            <span>{{ recu.created_at }}</span>
        </div>

        <p class="ligne-pointillee" />

        <div class="section-recu">
            <p class="section-titre">Voyage</p>
            <p class="trajet">{{ recu.ville_depart }} → {{ recu.ville_arrivee }}</p>
            <div class="ligne">
                <span>Date</span>
                <span>{{ recu.date_depart }}</span>
            </div>
            <div class="ligne">
                <span>Heure</span>
                <span>{{ recu.heure_depart }}</span>
            </div>
            <div class="ligne">
                <span>Bus</span>
                <span>{{ recu.vehicule }}</span>
            </div>
        </div>

        <div class="section-recu">
            <p class="section-titre">Billet</p>
            <div class="ligne">
                <span>Type</span>
                <span>{{ typeLabel[recu.type_billet] ?? recu.type_billet }}</span>
            </div>
            <div class="ligne">
                <span>Tarif</span>
                <span>{{ recu.tarification === 'vip' ? 'VIP' : 'Ordinaire' }}</span>
            </div>
            <div class="ligne place">
                <span>Siège</span>
                <span>N° {{ recu.numero_place }}</span>
            </div>
            <div class="ligne">
                <span>Prix</span>
                <span>{{ formatMontant(recu.montant) }}</span>
            </div>
            <div class="ligne">
                <span>Timbre</span>
                <span>{{ formatMontant(recu.timbre) }}</span>
            </div>
            <div class="ligne montant">
                <span>Total payé</span>
                <span>{{ formatMontant(recu.total) }}</span>
            </div>
        </div>

        <div class="section-recu">
            <p class="section-titre">Client</p>
            <div class="ligne">
                <span>Nom</span>
                <span>{{ recu.client || 'Anonyme' }}</span>
            </div>
            <div class="ligne">
                <span>Vendeur</span>
                <span>{{ recu.vendeur }}</span>
            </div>
        </div>

        <p class="ligne-pointillee" />
        <p class="text-center pied">{{ recu.compagnie?.pied_ticket || 'Merci et bon voyage !' }}</p>
    </div>

    <div v-if="partie !== 'ticket'" class="ticket-recu talon-controle">
        <div class="text-center">
            <p class="nom-agence talon-compagnie">{{ recu.compagnie?.nom || recu.agence }}</p>
            <p class="sous-titre">Talon contrôle</p>
        </div>

        <div class="talon-numero">
            <span>N°</span>
            <strong>{{ recu.numero }}</strong>
        </div>

        <div class="talon-route">
            <strong>{{ recu.ville_depart }} → {{ recu.ville_arrivee }}</strong>
            <span>{{ formatMontant(recu.total) }}</span>
        </div>

        <div class="ligne-coupe" />

        <div class="talon-bloc">
            <p class="talon-label">Client</p>
            <p class="talon-valeur">{{ recu.client || 'Anonyme' }}</p>
        </div>

        <div class="talon-bloc">
            <p class="talon-label">Siège / Bus</p>
            <p class="talon-valeur">N° {{ recu.numero_place }} · {{ recu.vehicule }}</p>
        </div>

        <div class="talon-bloc">
            <p class="talon-label">Départ</p>
            <p class="talon-valeur">{{ recu.date_depart }} {{ recu.heure_depart }}</p>
        </div>

        <div class="talon-bloc">
            <p class="talon-label">Agence / Agent</p>
            <p class="talon-valeur">{{ recu.agence }} · {{ recu.vendeur }}</p>
        </div>
    </div>
    </template>
</template>

<style scoped>
.ticket-recu {
    box-sizing: border-box;
    width: var(--impression-largeur-contenu, 70mm);
    margin: 0 auto;
    font-family: Arial, 'Helvetica Neue', sans-serif;
    font-size: 13px;
    line-height: 1.4;
    color: #000;
}

.ticket-recu,
.ticket-recu * {
    box-sizing: border-box;
    max-width: 100%;
    min-width: 0;
    overflow-wrap: anywhere;
    white-space: normal;
    word-break: break-word;
}

.ticket-principal,
.talon-controle {
    padding: 0 0.25mm 0.25mm;
}

.nom-agence {
    font-size: 14px;
    font-weight: 700;
    line-height: 1.05;
    text-transform: uppercase;
}

.logo {
    height: 28px;
    max-width: 44mm;
    object-fit: contain;
    margin: 0 auto 1px;
}

.slogan,
.contact {
    font-size: 11px;
}

.sous-titre {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
}

.ligne-pointillee {
    border-top: 1px dashed #000;
    margin: 4px 0;
}

.ligne {
    align-items: start;
    display: grid;
    gap: 0.35mm 1mm;
    /* auto : l'étiquette prend exactement la place de son texte, quelle que
     * soit la calibration — un pourcentage fixe devient trop étroit sur les
     * petites largeurs et force la coupure des étiquettes en plein mot. */
    grid-template-columns: auto minmax(0, 1fr);
}

/* !important nécessaire : la règle globale (app.css) force overflow-wrap:
 * anywhere + word-break: break-word sur tout span du reçu, pour ne jamais
 * dépasser la zone imprimable. Sur une étiquette, ça coupe au milieu du mot
 * dès que la colonne est étroite. keep-all autorise toujours le retour à la
 * ligne (entre les mots), juste plus jamais en plein milieu d'un mot. */
.ligne span:first-child {
    overflow-wrap: normal !important;
    word-break: keep-all !important;
}

.numero-encadre {
    align-items: start;
    border: 1px solid #000;
    display: grid;
    gap: 1mm;
    grid-template-columns: auto minmax(0, 1fr);
    margin: 4px 0;
    padding: 2px 1px;
}

/* Étiquette fixe (« N° »), jamais une valeur : retour à la ligne entre les
 * mots uniquement, jamais en plein milieu — voir .ligne span:first-child
 * plus haut pour le détail du !important. */
.numero-encadre span,
.talon-numero span {
    overflow-wrap: normal !important;
    word-break: keep-all !important;
}

.numero-encadre strong {
    font-size: 18px;
    letter-spacing: 0;
    text-align: right;
    word-break: break-all;
}

.section-recu {
    border: 1px solid #000;
    margin: 3px 0;
    padding: 1px;
}

.section-titre {
    background: #fff;
    border-bottom: 1px solid #000;
    font-weight: 700;
    margin: -1px -1px 2px;
    padding: 1px;
    text-transform: uppercase;
}

.trajet {
    font-size: 13px;
    font-weight: 700;
    text-align: center;
    margin: 2px 0;
}

.place,
.montant {
    font-size: 13px;
    font-weight: 700;
}

.pied {
    font-size: 12px;
    margin-top: 4px;
}

.talon-controle {
    min-height: 88mm;
}

.talon-compagnie {
    margin-bottom: 2px;
}

.talon-numero {
    align-items: start;
    border: 1px solid #000;
    display: grid;
    gap: 1.5mm;
    grid-template-columns: auto minmax(0, 1fr);
    margin: 4px 0;
    padding: 4px 3px;
}

.talon-numero strong {
    font-size: 18px;
    letter-spacing: 0;
    text-align: right;
    word-break: break-all;
}

.talon-route {
    align-items: start;
    display: grid;
    font-size: 13px;
    gap: 0.35mm 1mm;
    grid-template-columns: minmax(0, 1fr) auto;
    margin: 4px 0;
}

.ligne span:last-child,
.ligne strong,
.talon-route span:last-child {
    text-align: right;
    word-break: break-all;
}

.ligne-coupe {
    border-top: 1px dashed #000;
    margin: 6px 0;
}

.talon-bloc {
    border-bottom: 1px dashed #000;
    padding: 4px 0;
}

.talon-label {
    font-size: 11px;
    font-weight: 700;
}

.talon-valeur {
    font-size: 13px;
    font-weight: 700;
}
</style>
