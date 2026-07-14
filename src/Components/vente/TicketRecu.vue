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

defineProps<{
    recu: Recu | null;
}>();

const typeLabel: Record<string, string> = {
    aller: 'Aller simple',
    aller_retour: 'Aller-retour',
};

const formatMontant = (montant: number) => new Intl.NumberFormat('fr-FR').format(montant) + ' FCFA';
</script>

<template>
    <template v-if="recu">
    <div class="ticket-recu ticket-principal">
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
                <span>Place</span>
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

    <div class="ticket-recu talon-controle">
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
            <p class="talon-label">Place / Bus</p>
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
    width: 72mm;
    font-family: 'Courier New', monospace;
    font-size: 11px;
    line-height: 1.4;
    color: #000;
}

.ticket-principal,
.talon-controle {
    padding: 1mm;
}

.nom-agence {
    font-size: 14px;
    font-weight: 700;
    text-transform: uppercase;
}

.logo {
    max-height: 36px;
    max-width: 44mm;
    object-fit: contain;
    margin: 0 auto 3px;
}

.slogan,
.contact {
    font-size: 9px;
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
    display: flex;
    justify-content: space-between;
    gap: 8px;
}

.numero-encadre {
    align-items: center;
    border: 1px solid #000;
    display: flex;
    gap: 8px;
    justify-content: center;
    margin: 4px 0;
    padding: 4px 2px;
}

.numero-encadre strong {
    font-size: 20px;
    letter-spacing: 1px;
}

.section-recu {
    border: 1px solid #000;
    margin: 4px 0;
    padding: 3px;
}

.section-titre {
    background: #e9e9e9;
    border-bottom: 1px solid #000;
    font-weight: 700;
    margin: -3px -3px 3px;
    padding: 1px 3px;
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
    font-size: 10px;
    margin-top: 4px;
}

.talon-controle {
    min-height: 88mm;
}

.talon-compagnie {
    margin-bottom: 2px;
}

.talon-numero {
    align-items: center;
    border: 1px solid #000;
    display: flex;
    gap: 6px;
    margin: 8px 0 6px;
    padding: 6px 4px;
}

.talon-numero strong {
    font-size: 24px;
    letter-spacing: 1px;
}

.talon-route {
    align-items: center;
    display: flex;
    font-size: 13px;
    justify-content: space-between;
    margin: 4px 0;
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
    font-size: 9px;
    font-weight: 700;
}

.talon-valeur {
    font-size: 13px;
    font-weight: 700;
}
</style>
