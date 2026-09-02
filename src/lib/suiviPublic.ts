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
