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

defineProps<{
    recu: {
        numero_courrier: string;
        destination: string;
        agence_arrivee: string | null;
        agence_arrivee_telephone: string | null;
        voyage: string | null;
        expediteur: string;
        expediteur_nom: string;
        expediteur_telephone: string;
        destinataire: string;
        destinataire_nom: string;
        destinataire_telephone: string;
        colis: { nom: string; type: string; quantite: number; montant: number }[];
        prix_expedition: number;
        montant_colis: number;
        montant_total: number;
        agence_depart: string | null;
        agence_depart_telephone: string | null;
        agent: string | null;
        created_at: string;
        compagnie?: CompagnieRecu | null;
    };
    // Impression en deux passages séparés (reçu puis étiquette) : l'imprimante
    // coupe le papier entre les deux jobs, l'étiquette n'est plus collée.
    partie?: 'tout' | 'recu' | 'etiquette';
}>();

const formatMontant = (m: number) => new Intl.NumberFormat('fr-FR').format(m) + ' FCFA';
</script>

<template>
    <div v-if="(partie ?? 'tout') !== 'etiquette'" class="ticket-recu recu-courrier">
        <div class="text-center">
            <img
                v-if="recu.compagnie?.logo_data_uri || recu.compagnie?.logo_url"
                :src="recu.compagnie.logo_data_uri || recu.compagnie.logo_url || ''"
                alt=""
                class="logo"
            />
            <p class="compagnie">{{ recu.compagnie?.nom || recu.agence_depart }}</p>
            <p v-if="recu.compagnie?.telephone || recu.compagnie?.whatsapp" class="contact">
                <span v-if="recu.compagnie?.telephone">Tél : {{ recu.compagnie.telephone }}</span>
                <span v-if="recu.compagnie?.telephone && recu.compagnie?.whatsapp"> · </span>
                <span v-if="recu.compagnie?.whatsapp">WhatsApp : {{ recu.compagnie.whatsapp }}</span>
            </p>
        </div>

        <div class="numero-recu">
            <span>N° COURRIER</span>
            <strong>{{ recu.numero_courrier }}</strong>
        </div>

        <div class="bloc">
            <p class="titre">Expéditeur</p>
            <p class="nom">{{ recu.expediteur_nom }}</p>
            <div class="ligne">
                <span>Téléphone :</span>
                <strong>{{ recu.expediteur_telephone }}</strong>
            </div>
            <div class="ligne">
                <span>Frais d'envoi :</span>
                <strong>{{ formatMontant(recu.prix_expedition) }}</strong>
            </div>
            <div class="ligne">
                <span>Valeur :</span>
                <span>{{ formatMontant(recu.montant_colis) }}</span>
            </div>
            <div class="ligne">
                <span>Agence :</span>
                <span>{{ recu.agence_depart || '-' }}</span>
            </div>
            <p v-if="recu.agence_depart_telephone" class="petit">Tél agence : {{ recu.agence_depart_telephone }}</p>
            <div class="ligne">
                <span>Agent :</span>
                <span>{{ recu.agent || '-' }}</span>
            </div>
            <div class="ligne">
                <span>Déposé le :</span>
                <span>{{ recu.created_at }}</span>
            </div>
        </div>

        <div class="bloc">
            <p class="titre">Bénéficiaire</p>
            <p class="nom">{{ recu.destinataire_nom }}</p>
            <div class="ligne">
                <span>Téléphone :</span>
                <strong>{{ recu.destinataire_telephone }}</strong>
            </div>
            <div class="ligne">
                <span>Destination :</span>
                <strong>{{ recu.destination }}</strong>
            </div>
            <p v-if="recu.agence_arrivee" class="petit">{{ recu.agence_arrivee }}</p>
            <p v-if="recu.agence_arrivee_telephone" class="petit">Tél agence : {{ recu.agence_arrivee_telephone }}</p>
            <p v-if="recu.voyage" class="petit">Voyage : {{ recu.voyage }}</p>
        </div>

        <div class="bloc contenu">
            <p class="titre">Contenu</p>
            <p v-for="(c, i) in recu.colis" :key="i">{{ c.quantite }} × {{ c.nom }} ({{ c.type }}) — {{ formatMontant(c.montant) }}</p>
        </div>

        <p class="note">Les colis et objets doivent être déclarés avant l'envoi. Passé ce délai, les frais d'expédition sont imputables.</p>
        <hr v-if="recu.compagnie?.pied_ticket" />
        <p v-if="recu.compagnie?.pied_ticket" class="pied">{{ recu.compagnie.pied_ticket }}</p>
    </div>

    <div v-if="(partie ?? 'tout') !== 'recu'" class="ticket-recu etiquette-courrier">
        <div class="text-center">
            <p class="compagnie">{{ recu.compagnie?.nom || recu.agence_depart }}</p>
            <p class="contact">Étiquette courrier à coller</p>
        </div>

        <div class="numero-etiquette">
            <strong>{{ recu.numero_courrier }}</strong>
        </div>

        <div class="destination-etiquette">
            {{ recu.destination }}
        </div>
        <p v-if="recu.agence_arrivee" class="agence-etiquette">{{ recu.agence_arrivee }}</p>
        <p v-if="recu.agence_arrivee_telephone" class="petit">Tél agence : {{ recu.agence_arrivee_telephone }}</p>

        <div class="bloc">
            <p class="titre">Destinataire</p>
            <p class="nom etiquette-nom">{{ recu.destinataire_nom }}</p>
            <p class="telephone">{{ recu.destinataire_telephone }}</p>
        </div>

        <div class="bloc">
            <p class="titre">Expéditeur</p>
            <p>{{ recu.expediteur_nom }}</p>
            <p>{{ recu.expediteur_telephone }}</p>
        </div>

        <div class="bloc contenu">
            <p class="titre">Contenu</p>
            <p v-for="(c, i) in recu.colis" :key="i">{{ c.quantite }} × {{ c.nom }} ({{ c.type }})</p>
        </div>

        <div class="bas-etiquette">
            <span>{{ recu.created_at }}</span>
            <span>{{ recu.agence_depart || '-' }}</span>
        </div>
        <p v-if="recu.agence_depart_telephone" class="petit text-right">Tél agence : {{ recu.agence_depart_telephone }}</p>
    </div>
</template>

<style scoped>
.ticket-recu {
    box-sizing: border-box;
    width: var(--impression-largeur-contenu, 70mm);
    margin: 0 auto;
    color: #000;
    font-family: Arial, 'Helvetica Neue', sans-serif;
    font-size: 14px;
    line-height: 1.4;
    padding: 0 0.25mm 0.25mm;
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

.logo {
    height: 26px;
    max-width: 44mm;
    object-fit: contain;
    margin: 0 auto 1px;
}

.compagnie {
    font-size: 16px;
    font-weight: 700;
    line-height: 1.05;
    text-transform: uppercase;
}

.contact,
.petit,
.note,
.pied {
    font-size: 12px;
}

.numero-recu,
.numero-etiquette {
    border: 1px solid #000;
    margin: 3px 0;
    padding: 3px;
}

.numero-recu {
    align-items: start;
    display: grid;
    gap: 0.35mm 1mm;
    grid-template-columns: auto minmax(0, 1fr);
}

.numero-recu span,
.titre {
    font-weight: 700;
    text-decoration: underline;
    text-transform: uppercase;
}

/* Étiquette fixe (« N° COURRIER »), jamais une valeur : retour à la ligne
 * entre les mots uniquement, jamais en plein milieu — voir .ligne span:first-child
 * ci-dessous pour l'explication complète du !important. */
.numero-recu span {
    overflow-wrap: normal !important;
    word-break: keep-all !important;
}

.numero-recu strong,
.numero-etiquette strong {
    font-size: 18px;
    text-align: right;
    word-break: break-all;
}

.numero-etiquette {
    text-align: center;
}

.bloc {
    border: 1px solid #000;
    margin: 3px 0;
    padding: 2px;
}

.ligne {
    align-items: start;
    display: grid;
    gap: 0.35mm 1mm;
    grid-template-columns: minmax(10mm, 28%) minmax(0, 1fr);
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

.ligne span:last-child,
.ligne strong {
    text-align: right;
    word-break: break-all;
}

.nom {
    font-size: 15px;
    font-weight: 700;
    text-transform: uppercase;
}

.contenu {
    min-height: 22mm;
}

.note,
.pied {
    text-align: center;
}

.etiquette-courrier {
    min-height: 86mm;
}

.destination-etiquette {
    border-bottom: 1px dashed #000;
    font-size: 20px;
    font-weight: 700;
    margin-top: 6px;
    padding-bottom: 4px;
    text-transform: uppercase;
}

.agence-etiquette {
    font-size: 12px;
    font-weight: 700;
}

.etiquette-nom,
.telephone {
    font-size: 16px;
}

.bas-etiquette {
    border-top: 1px dashed #000;
    display: grid;
    gap: 0.35mm 1mm;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    margin-top: 8px;
    padding-top: 5px;
}
</style>
