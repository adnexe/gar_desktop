import { ConfigRepository } from '../repositories/ConfigRepository';

export function normaliserAdresseAdmin(valeur: unknown): string {
    if (typeof valeur !== 'string' || valeur.trim().length === 0 || valeur.length > 2048) {
        throw new Error('Renseignez une adresse admin valide, commençant par https:// ou http://.');
    }
    let url: URL;
    try {
        url = new URL(valeur.trim());
    } catch {
        throw new Error('Adresse admin non valide. Exemple : https://admin.exemple.com');
    }
    if (!['https:', 'http:'].includes(url.protocol) || !url.hostname || url.username || url.password || url.search || url.hash) {
        throw new Error('Utilisez uniquement l’adresse du site admin, sans identifiants, paramètres ni fragment.');
    }
    if (/\/api(?:\/desktop)?\/?$/.test(url.pathname)) {
        throw new Error('Renseignez l’adresse du site admin sans ajouter /api ou /api/desktop.');
    }
    return url.toString().replace(/\/+$/, '');
}

export function adresseAdmin(): string {
    // Lecture à chaque appel : un changement local ne nécessite ni rebuild ni
    // redémarrage. L'ancien .env reste le défaut des installations existantes.
    return normaliserAdresseAdmin(new ConfigRepository().obtenir('admin_url')
        || process.env.GAR_API_URL || 'http://127.0.0.1:8000');
}
