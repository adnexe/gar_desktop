const pad = (n: number, longueur = 2) => String(n).padStart(longueur, '0');

/**
 * Horloge métier de la caisse.
 *
 * La Côte d'Ivoire est en UTC+0 toute l'année. On lit volontairement les
 * composants affichés par Windows puis on les stocke comme heure d'Abidjan :
 * un poste dont le fuseau est mal configuré mais dont l'heure affichée est
 * correcte ne peut plus faire basculer la vente sur la veille.
 */
export function maintenantCaisseIso(date = new Date()): string {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
        + `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}Z`;
}

export function dateCaisseDuJour(date = new Date()): string {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function formatDateHeure(iso: string): string {
    const parties = iso.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
    if (parties) {
        return `${parties[3]}/${parties[2]}/${parties[1]} ${parties[4]}:${parties[5]}`;
    }

    const d = new Date(iso);
    return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export function formatDate(dateSql: string): string {
    const parties = dateSql.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (parties) {
        return `${parties[3]}/${parties[2]}/${parties[1]}`;
    }

    const d = new Date(dateSql);
    return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}
