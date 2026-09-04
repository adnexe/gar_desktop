import axios, { type AxiosRequestConfig } from 'axios';
import { adresseAdmin } from './adresse';
import type { BootstrapResponse } from '../types/bootstrap';
import type { RecoverySnapshot, RecoverySection } from '../services/RecoveryImport';

const http = axios.create({ timeout: 15000 });

async function postAdmin<T = any>(chemin: string, payload: unknown, options: AxiosRequestConfig = {}) {
    const baseURL = adresseAdmin();
    try {
        const response = await http.post<T>(chemin, payload, { ...options, baseURL });
        if (adresseAdmin() !== baseURL) throw new Error('Adresse admin modifiée. Réessayez cette opération.');
        return response;
    } catch (error) {
        // Une réponse de l'ancienne adresse ne doit pas invalider la licence
        // ou remplacer le catalogue après le changement de serveur.
        if (adresseAdmin() !== baseURL) throw new Error('Adresse admin modifiée. Réessayez cette opération.');
        throw error;
    }
}

export async function verifierAdresseAdmin(url: string, reference: string): Promise<Pick<BootstrapResponse, 'agence' | 'token'>> {
    try {
        // Ne transmet ni le jeton actuel ni un mot de passe à une nouvelle URL.
        const { data } = await http.post<BootstrapResponse>('/api/desktop/bootstrap', {
            reference, appareil: 'verification-adresse-poste',
        }, { baseURL: url, timeout: 15000, maxRedirects: 0 });
        return { agence: data?.agence, token: data?.token };
    } catch {
        throw new Error('Impossible de vérifier cette adresse pour votre agence. Vérifiez le lien, Internet et l’activation de l’agence. L’adresse précédente est conservée.');
    }
}

export async function modifierMotDePasseAdmin(token: string, uuid: string, currentPassword: string, password: string, confirmation: string): Promise<{ uuid: string; updated_at: string }> {
    try {
        const { data } = await postAdmin('/api/desktop/profil/mot-de-passe', {
            user_uuid: uuid, current_password: currentPassword, password, password_confirmation: confirmation,
        }, { maxRedirects: 0, headers: { Authorization: `Bearer ${token}` } });
        return data;
    } catch (error) {
        // Axios contient les mots de passe dans sa configuration : ne jamais
        // transmettre cette exception au logger ou au renderer.
        const status = axios.isAxiosError(error) ? error.response?.status : null;
        const message = status === 401 ? 'Actualisez la connexion avec admin depuis les paramètres, puis réessayez.'
            : status === 403 ? 'Votre compte ou votre agence ne permet plus cette modification. Contactez votre responsable.'
                : status === 404 ? 'Admin doit être mis à jour pour permettre le changement de mot de passe.'
                    : status === 422 ? 'Vérifiez votre mot de passe actuel, le nouveau mot de passe et sa confirmation.'
                        : status === 429 ? 'Trop de tentatives. Patientez une minute avant de réessayer.'
                            : 'La confirmation d’admin n’a pas été reçue. Vérifiez Internet. Le changement a peut-être été enregistré : reconnectez-vous en ligne avec le nouveau mot de passe pour vérifier.';
        throw new Error(message);
    }
}

export async function recupererVentesAdmin(token: string, section: RecoverySection, date: string, acteurUuid: string, password: string): Promise<RecoverySnapshot> {
    try {
        const { data } = await postAdmin<RecoverySnapshot>('/api/desktop/recuperation', { section, date, acteur_uuid: acteurUuid, password }, {
            timeout: 60000, maxContentLength: 64 * 1024 * 1024,
            headers: { Authorization: `Bearer ${token}` },
        });
        return data;
    } catch (error) {
        // Never forward/log Axios config: it contains the confirmation password.
        const status = axios.isAxiosError(error) ? error.response?.status : null;
        const message = status === 403 ? 'Compte super administrateur ou mot de passe non valide, ou agence désactivée.'
            : status === 401 ? 'La connexion avec admin doit être actualisée depuis les paramètres.'
                : status === 404 ? 'Mettez admin à jour pour utiliser la récupération.'
                    : status === 429 ? 'Patientez une minute avant de réessayer.'
                        : status === 409 || status === 422 ? 'Les données sauvegardées sont incomplètes ou incompatibles. Faites vérifier admin.'
                            : 'Impossible de récupérer les données. Vérifiez Internet et réessayez. Aucune donnée locale modifiée.';
        throw new Error(message);
    }
}

export function apiBaseUrl(): string {
    return adresseAdmin();
}

export async function envoyerPresencePoste(token: string, payload: Record<string, unknown>, timeout: number, signal: AbortSignal): Promise<{ acquittements: { uuid: string; revision: number }[] }> {
    const { data } = await postAdmin('/api/desktop/presence', payload, {
        timeout, signal: AbortSignal.any([signal, AbortSignal.timeout(timeout)]),
        headers: { Authorization: `Bearer ${token}` },
    });
    return data;
}

export async function bootstrap(reference: string, appareil: string, codePoste?: string | null, timeoutMs = 15000): Promise<BootstrapResponse> {
    const { data } = await postAdmin<BootstrapResponse>('/api/desktop/bootstrap', { reference, appareil, code_poste: codePoste ?? null }, { timeout: timeoutMs });
    return data;
}

export interface LicenceDesktop {
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

export interface ReponseLicenceDesktop {
    ok: boolean;
    statut: string;
    message: string;
    licence?: LicenceDesktop;
}

export async function reclamerLicence(
    reference: string,
    appareil: string,
    licenceUuid?: string | null,
    codePoste?: string | null,
    timeoutMs = 10000,
): Promise<ReponseLicenceDesktop> {
    const { data } = await postAdmin<ReponseLicenceDesktop>(
        '/api/desktop/licence/reclamer',
        { reference, appareil, licence_uuid: licenceUuid ?? null, code_poste: codePoste ?? null },
        {
            timeout: timeoutMs,
            validateStatus: (status) => status < 500,
        },
    );

    return data;
}

export interface OperationSyncApi {
    entite: string;
    uuid: string;
    operation: string;
    payload: Record<string, unknown>;
}

export async function envoyerOperationSync(token: string, operation: OperationSyncApi, timeoutMs = 10000): Promise<void> {
    await postAdmin('/api/desktop/sync', operation, {
        timeout: timeoutMs,
        headers: {
            Authorization: `Bearer ${token}`,
        },
    });
}
