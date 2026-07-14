import { ConfigRepository } from './ConfigRepository';

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
}

export class CompagnieRepository {
    private readonly config = new ConfigRepository();

    actuelle(): CompagnieLocale {
        const valeur = (cle: string) => {
            const v = this.config.obtenir(cle);
            return v && v.length > 0 ? v : null;
        };

        return {
            nom: valeur('compagnie_nom'),
            slogan: valeur('compagnie_slogan'),
            telephone: valeur('compagnie_telephone'),
            whatsapp: valeur('compagnie_whatsapp'),
            email: valeur('compagnie_email'),
            site_web: valeur('compagnie_site_web'),
            adresse: valeur('compagnie_adresse'),
            pied_ticket: valeur('compagnie_pied_ticket'),
            logo_url: valeur('compagnie_logo_url'),
            logo_data_uri: valeur('compagnie_logo_data_uri'),
        };
    }
}
