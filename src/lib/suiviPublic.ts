export type TypeSuiviPublic = 'ticket' | 'bagage' | 'courrier' | 'courrier-international';

export function construireLienSuiviPublic(
    adresseAdmin: string | null | undefined,
    type: TypeSuiviPublic,
    numero: string,
    uuid: string,
): string | null {
    const base = adresseAdmin?.trim().replace(/\/+$/, '');
    const numeroNettoye = numero.trim();
    const cle = uuid.trim();

    if (!base || !numeroNettoye || !cle) return null;

    return `${base}/suivi/${type}/${encodeURIComponent(numeroNettoye)}?cle=${encodeURIComponent(cle)}`;
}

export async function construireLienSuiviDepuisPoste(
    type: TypeSuiviPublic,
    numero: string,
    uuid: string,
): Promise<string | null> {
    try {
        return construireLienSuiviPublic(await window.api.config.adresseAdmin(), type, numero, uuid);
    } catch {
        // Le suivi public est utile, mais ne doit jamais empêcher une vente ou
        // l'impression de son justificatif si la configuration est illisible.
        return null;
    }
}
