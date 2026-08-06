<script setup lang="ts">
type CompagnieRecu = {
    nom: string | null;
    slogan: string | null;
    telephone: string | null;
    whatsapp: string | null;
    site_web: string | null;
    logo_url?: string | null;
    logo_data_uri?: string | null;
    pied_ticket: string | null;
};

type RecuBagage = {
    numero_bagage: string;
    numero_ticket: string | null;
    numero_place: number | null;
    reference: string;
    destination: string | null;
    voyage: string | null;
    client: string | null;
    client_telephone?: string | null;
    valeur: number | null;
    montant: number;
    description: string | null;
    agence: string | null;
    agent: string | null;
    created_at: string;
    compagnie?: CompagnieRecu | null;
};

withDefaults(defineProps<{
    recu: RecuBagage;
    mode?: 'recu' | 'talon';
}>(), {
    mode: 'recu',
});

const formatMontant = (m: number) => new Intl.NumberFormat('fr-FR').format(m) + ' FCFA';
</script>

<template>
    <div v-if="mode !== 'talon'" class="ticket-recu recu-bagage">
        <div class="text-center">
            <img
                v-if="recu.compagnie?.logo_data_uri || recu.compagnie?.logo_url"
                :src="recu.compagnie.logo_data_uri || recu.compagnie.logo_url || ''"
                alt=""
                class="logo"
            />
            <p class="compagnie">{{ recu.compagnie?.nom || recu.agence }}</p>
            <p v-if="recu.compagnie?.telephone || recu.compagnie?.whatsapp" class="contact">
                <span v-if="recu.compagnie?.telephone">Tél : {{ recu.compagnie.telephone }}</span>
                <span v-if="recu.compagnie?.telephone && recu.compagnie?.whatsapp"> · </span>
                <span v-if="recu.compagnie?.whatsapp">WhatsApp : {{ recu.compagnie.whatsapp }}</span>
            </p>
        </div>

        <div class="numero-recu numero-encadre">
            <span>N° REÇU BAGAGES</span>
            <strong>{{ recu.numero_bagage }}</strong>
        </div>

        <div class="bloc section-recu">
            <p class="titre section-titre">N° TICKET</p>
            <p class="numero-ticket">{{ recu.numero_ticket || 'Sans ticket' }}</p>
            <p v-if="recu.numero_place" class="petit">Siège N° {{ recu.numero_place }}</p>
            <p v-if="recu.destination" class="destination">{{ recu.destination }}</p>
            <p v-if="recu.voyage" class="petit">Voyage : {{ recu.voyage }}</p>
        </div>

        <div class="bloc section-recu">
            <p class="titre section-titre">CLIENT</p>
            <p class="nom-client">{{ recu.client || 'Client anonyme' }}</p>
            <p v-if="recu.client_telephone" class="petit">{{ recu.client_telephone }}</p>
            <div class="ligne montant">
                <span>Montant :</span>
                <strong>{{ formatMontant(recu.montant) }}</strong>
            </div>
            <div class="ligne">
                <span>Enregistré le :</span>
                <span>{{ recu.created_at }}</span>
            </div>
            <div class="ligne">
                <span>Valeur :</span>
                <span>{{ recu.valeur !== null ? formatMontant(recu.valeur) : '0 FCFA' }}</span>
            </div>
            <div class="ligne">
                <span>Agence :</span>
                <span>{{ recu.agence || '-' }}</span>
            </div>
            <div class="ligne">
                <span>Agent :</span>
                <span>{{ recu.agent || '-' }}</span>
            </div>
        </div>

        <div class="bloc contenu section-recu">
            <p class="titre section-titre">CONTENU</p>
            <p class="description-bagage">{{ recu.description || 'Bagage' }}</p>
        </div>

        <hr v-if="recu.compagnie?.pied_ticket" />
        <p v-if="recu.compagnie?.pied_ticket" class="pied">{{ recu.compagnie.pied_ticket }}</p>
    </div>

    <div v-if="mode !== 'recu'" class="ticket-recu talon-bagage">
        <div class="text-center">
            <p class="compagnie">{{ recu.compagnie?.nom || recu.agence }}</p>
            <p class="contact">Talon bagage à coller</p>
        </div>

        <div class="numero-talon">
            <span>N° BAGAGE</span>
            <strong>{{ recu.numero_bagage }}</strong>
        </div>

        <div class="bloc">
            <div class="ligne importante">
                <span>N° Ticket</span>
                <strong>{{ recu.numero_ticket || 'Sans ticket' }}</strong>
            </div>
            <div class="ligne">
                <span>Siège</span>
                <span>{{ recu.numero_place ? `N° ${recu.numero_place}` : '' }}</span>
            </div>
            <p class="titre">Destination</p>
            <div class="destination-talon">{{ recu.destination || '' }}</div>
            <div class="ligne">
                <span>Voyage</span>
                <span>{{ recu.voyage || '' }}</span>
            </div>
        </div>

        <div class="bloc">
            <p class="titre">CLIENT</p>
            <p class="nom-client">{{ recu.client || '' }}</p>
            <div class="ligne">
                <span>Téléphone</span>
                <span>{{ recu.client_telephone || '' }}</span>
            </div>
        </div>

        <div class="bloc contenu">
            <p class="titre">CONTENU</p>
            <p>{{ recu.description || '' }}</p>
            <div class="ligne">
                <span>Valeur déclarée</span>
                <span>{{ recu.valeur !== null ? formatMontant(recu.valeur) : '' }}</span>
            </div>
            <div class="ligne">
                <span>Montant payé</span>
                <strong>{{ formatMontant(recu.montant) }}</strong>
            </div>
        </div>

        <div class="bas-talon">
            <span>{{ recu.created_at }}</span>
            <span>{{ recu.agence || '-' }}</span>
        </div>
    </div>
</template>

<style scoped>
.ticket-recu {
    box-sizing: border-box;
    width: var(--impression-largeur-contenu, 70mm);
    margin: 0 auto;
    color: #000;
    font-family: Arial, 'Helvetica Neue', sans-serif;
    font-size: 13px;
    line-height: 1.28;
    padding: 0;
}

.ticket-recu,
.ticket-recu * {
    box-sizing: border-box;
    max-width: 100%;
    min-width: 0;
    overflow-wrap: anywhere;
    white-space: normal;
    word-break: normal;
}

.logo {
    height: 26px;
    max-width: 44mm;
    object-fit: contain;
    margin: 0 auto 1px;
}

.compagnie {
    font-size: 14px;
    font-weight: 700;
    line-height: 1.05;
    text-transform: uppercase;
    word-break: break-all;
}

.contact,
.petit,
.pied {
    font-size: 11px;
}

.numero-recu {
    align-items: start;
    border: 1px solid #000;
    display: grid;
    gap: 0.5mm;
    grid-template-columns: auto minmax(0, 1fr);
    margin: 2px 0;
    padding: 1px;
}

.numero-talon {
    align-items: start;
    border: 1px solid #000;
    display: flex;
    flex-wrap: wrap;
    gap: 0.35mm 1mm;
    justify-content: space-between;
    margin: 3px 0;
    padding: 2px;
}

.numero-recu span,
.numero-talon span,
.titre {
    font-weight: 700;
    text-transform: uppercase;
}

/* Étiquettes fixes (« N° REÇU BAGAGES », « N° BAGAGE »), jamais une valeur :
 * retour à la ligne entre les mots uniquement, jamais en plein milieu — voir
 * .recu-bagage .ligne span:first-child plus bas pour le détail du !important. */
.numero-recu span,
.numero-talon span {
    overflow-wrap: normal !important;
    word-break: keep-all !important;
}

.numero-recu strong,
.numero-talon strong {
    font-size: 16px;
    line-height: 1.12;
    min-width: 0;
    overflow-wrap: anywhere;
    text-align: left;
    word-break: break-all;
}

.numero-talon span {
    flex: 0 1 auto;
    min-width: 0;
}

.numero-talon strong {
    flex: 1 1 26mm;
}

.bloc {
    border: 1px solid #000;
    margin: 2px 0;
    padding: 1px;
}

.recu-bagage .section-recu {
    padding: 0.5px;
}

.recu-bagage .section-titre {
    background: #fff;
    border-bottom: 1px solid #000;
    margin: -0.5px -0.5px 1px;
    padding: 0.5px;
}

.numero-ticket {
    font-size: 18px;
    font-weight: 700;
    line-height: 1.1;
    overflow-wrap: anywhere;
    text-align: center;
    word-break: break-all;
}

.destination,
.destination-talon {
    font-size: 18px;
    font-weight: 700;
    line-height: 1.1;
    overflow-wrap: anywhere;
    text-transform: uppercase;
    word-break: break-all;
}

.destination-talon {
    margin-top: 6px;
}

.nom-client {
    font-size: 13px;
    font-weight: 700;
    overflow-wrap: anywhere;
    text-transform: uppercase;
    word-break: break-all;
}

.talon-bagage .ligne {
    align-items: start;
    display: flex;
    flex-wrap: wrap;
    gap: 0.35mm 1mm;
    justify-content: space-between;
}

.recu-bagage .ligne {
    align-items: start;
    display: grid;
    gap: 0.2mm 0.6mm;
    /* auto : l'étiquette prend exactement la place de son texte, quelle que
     * soit la calibration — un pourcentage fixe devient trop étroit sur les
     * petites largeurs et force la coupure des étiquettes en plein mot. */
    grid-template-columns: auto minmax(0, 1fr);
}

/* !important nécessaire : la règle globale (app.css) force overflow-wrap:
 * anywhere + word-break: break-word sur tout span du reçu, pour ne jamais
 * dépasser la zone imprimable. Sur une étiquette (« Enregistré le : »),
 * ça coupe au milieu du mot (« Enregis »/« tré le : ») dès que la colonne
 * est un peu étroite. keep-all autorise toujours le retour à la ligne
 * (entre les mots), juste plus jamais en plein milieu d'un mot. */
.recu-bagage .ligne span:first-child {
    overflow-wrap: normal !important;
    word-break: keep-all !important;
}

.talon-bagage .ligne span:first-child {
    flex: 0 1 24mm;
    overflow-wrap: normal !important;
    word-break: keep-all !important;
}

.ligne span:last-child,
.ligne strong {
    min-width: 0;
    overflow-wrap: anywhere;
    text-align: left;
    word-break: break-word;
}

.recu-bagage p,
.recu-bagage span,
.recu-bagage strong {
    overflow-wrap: anywhere;
    white-space: normal;
    word-break: normal;
}

.recu-bagage .montant strong {
    font-size: 15px;
    font-weight: 700;
}

.talon-bagage .ligne span:last-child,
.talon-bagage .ligne strong {
    flex: 1 1 24mm;
}

.montant {
    font-size: 14px;
    margin: 2px 0;
}

.importante strong {
    font-size: 16px;
}

.contenu {
    min-height: 12mm;
}

.pied {
    text-align: center;
}

.talon-bagage {
    min-height: 70mm;
}

.bas-talon {
    border-top: 1px dashed #000;
    display: grid;
    gap: 0.35mm 1mm;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    margin-top: 8px;
    padding-top: 5px;
}
</style>
