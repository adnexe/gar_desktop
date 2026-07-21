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
    <div v-if="mode === 'recu'" class="ticket-recu recu-bagage">
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

        <div class="numero-recu">
            <span>N° REÇU BAGAGES</span>
            <strong>{{ recu.numero_bagage }}</strong>
        </div>

        <div class="bloc">
            <p class="titre">N° TICKET</p>
            <p class="numero-ticket">{{ recu.numero_ticket || 'Sans ticket' }}</p>
            <p v-if="recu.numero_place" class="petit">Siège N° {{ recu.numero_place }}</p>
            <p v-if="recu.destination" class="destination">{{ recu.destination }}</p>
            <p v-if="recu.voyage" class="petit">Voyage : {{ recu.voyage }}</p>
        </div>

        <div class="bloc">
            <p class="titre">CLIENT</p>
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

        <div class="bloc contenu">
            <p class="titre">{{ recu.description || 'Bagage' }}</p>
        </div>

        <hr v-if="recu.compagnie?.pied_ticket" />
        <p v-if="recu.compagnie?.pied_ticket" class="pied">{{ recu.compagnie.pied_ticket }}</p>
    </div>

    <div v-else class="ticket-recu talon-bagage">
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
    /* 70mm centré dans les 80mm du papier (voir .zone-impression) : la
       marge de 5mm de chaque côté absorbe les petits décalages propres à
       chaque modèle d'imprimante (Epson, Xprinter...) sans rogner le texte. */
    width: 70mm;
    margin: 0 auto;
    color: #000;
    font-family: Arial, 'Helvetica Neue', sans-serif;
    font-size: 13px;
    line-height: 1.35;
    padding: 1mm;
}

.logo {
    height: 34px;
    max-width: 44mm;
    object-fit: contain;
    margin: 0 auto 3px;
}

.compagnie {
    font-size: 14px;
    font-weight: 700;
    text-transform: uppercase;
}

.contact,
.petit,
.pied {
    font-size: 11px;
}

.numero-recu,
.numero-talon {
    align-items: center;
    border: 1px solid #000;
    display: flex;
    justify-content: space-between;
    margin: 5px 0;
    padding: 5px;
}

.numero-recu span,
.numero-talon span,
.titre {
    font-weight: 700;
    text-transform: uppercase;
}

.numero-recu strong,
.numero-talon strong {
    font-size: 20px;
}

.bloc {
    border: 1px solid #000;
    margin: 5px 0;
    padding: 5px;
}

.numero-ticket {
    font-size: 20px;
    font-weight: 700;
    text-align: center;
}

.destination,
.destination-talon {
    font-size: 20px;
    font-weight: 700;
    text-transform: uppercase;
}

.destination-talon {
    margin-top: 6px;
}

.nom-client {
    font-size: 13px;
    font-weight: 700;
    text-transform: uppercase;
}

.ligne {
    align-items: baseline;
    display: flex;
    gap: 8px;
    justify-content: space-between;
}

.ligne span:last-child,
.ligne strong {
    text-align: right;
}

.montant {
    font-size: 15px;
    margin: 8px 0;
}

.importante strong {
    font-size: 16px;
}

.contenu {
    min-height: 20mm;
}

.pied {
    text-align: center;
}

.talon-bagage {
    min-height: 70mm;
}

.bas-talon {
    border-top: 1px dashed #000;
    display: flex;
    justify-content: space-between;
    margin-top: 8px;
    padding-top: 5px;
}
</style>
