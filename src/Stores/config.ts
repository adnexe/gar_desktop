import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

export interface AgenceLocale {
    id: number;
    uuid: string;
    reference: string;
    telephone: string | null;
    nom: string;
    ville_id: number;
    ville_nom: string;
}

export interface LicenceLocale {
    uuid: string;
    code: string;
    code_poste: string | null;
    agence_id: number;
    date_debut: string;
    date_expiration: string;
    actif: boolean;
    assigned_at: string | null;
    assigned_device: string | null;
    statut: string;
}

export interface CompagnieLocale {
    nom: string | null;
    slogan: string | null;
    telephone: string | null;
    whatsapp: string | null;
    email: string | null;
    site_web: string | null;
    adresse: string | null;
    pied_ticket: string | null;
    logo_url: string | null;
    logo_data_uri: string | null;
    modules_actifs: string[];
}

export interface ReponseLicence {
    ok: boolean;
    statut: string;
    message: string;
    licence?: LicenceLocale;
}

export const useConfigStore = defineStore('config', () => {
    const configuree = ref<boolean | null>(null);
    const agence = ref<AgenceLocale | null>(null);
    const compagnie = ref<CompagnieLocale | null>(null);
    const licence = ref<LicenceLocale | null>(null);

    // Réglage de l'entreprise (pas de l'agent) : masque/bloque les écrans
    // liés à un module que l'entreprise n'utilise pas du tout. Tant que rien
    // n'est encore chargé, on ne restreint rien (fail open, comme l'admin).
    const moduleActif = (module: 'ticket' | 'bagage' | 'courrier') => compagnie.value?.modules_actifs.includes(module) ?? true;

    const licenceValide = computed(() => {
        if (!licence.value || !licence.value.actif) return false;
        if (['expiree', 'desactivee', 'aucune_licence'].includes(licence.value.statut)) return false;

        return licence.value.date_expiration >= dateDuJour();
    });

    async function charger() {
        configuree.value = await window.api.config.estConfiguree();
        licence.value = await window.api.config.licenceActuelle();
        if (configuree.value) {
            agence.value = await window.api.config.agenceActuelle();
            compagnie.value = await window.api.config.compagnieActuelle();
        }
    }

    // Revérifie la licence auprès du serveur (silencieux hors-ligne) puis
    // recharge l'état local — c'est la base locale qui fait foi ensuite.
    async function verifierLicence() {
        licence.value = (await window.api.config.verifierLicence()) as LicenceLocale | null;
    }

    async function chargerLicence() {
        licence.value = await window.api.config.licenceActuelle();
    }

    // Relit l'état local complet : détecte l'invalidation de licence comme la
    // réinitialisation du poste (agence supprimée) faites en arrière-plan.
    async function rafraichirEtat() {
        configuree.value = (await window.api.config.estConfiguree()) as boolean;
        licence.value = await window.api.config.licenceActuelle();
    }

    async function reclamerLicence(reference: string, appareil: string, codePoste?: string | null): Promise<ReponseLicence> {
        const resultat = (await window.api.config.reclamerLicence(reference, appareil, codePoste ?? null)) as ReponseLicence;
        if (resultat.ok && resultat.licence) {
            licence.value = resultat.licence;
        } else if (licence.value && ['expiree', 'desactivee', 'aucune_licence'].includes(resultat.statut)) {
            licence.value = { ...licence.value, actif: false, statut: resultat.statut };
        }

        return resultat;
    }

    async function configurer(reference: string, appareil: string, codePoste?: string | null) {
        agence.value = (await window.api.config.configurer(reference, appareil, codePoste ?? null)) as AgenceLocale;
        compagnie.value = await window.api.config.compagnieActuelle();
        licence.value = await window.api.config.licenceActuelle();
        configuree.value = true;
    }

    function dateDuJour() {
        const maintenant = new Date();
        const pad = (n: number) => String(n).padStart(2, '0');

        return `${maintenant.getFullYear()}-${pad(maintenant.getMonth() + 1)}-${pad(maintenant.getDate())}`;
    }

    return { configuree, agence, compagnie, licence, licenceValide, moduleActif, charger, chargerLicence, rafraichirEtat, verifierLicence, reclamerLicence, configurer };
});
