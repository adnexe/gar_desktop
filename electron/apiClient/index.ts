import axios from 'axios';
import type { BootstrapResponse } from '../types/bootstrap';

// En dev, l'admin Laravel tourne en local (php artisan serve). En production,
// cette URL doit pointer vers le serveur central — à rendre configurable
// (variable d'environnement / écran de config) avant le packaging final.
const BASE_URL = (process.env.GAR_API_URL ?? 'http://127.0.0.1:8000').replace(/\/+$/, '');
// const BASE_URL = (process.env.GAR_API_URL ?? 'http://127.0.0.1:8000').replace(/\/+$/, '');

const http = axios.create({ baseURL: BASE_URL, timeout: 15000 });

export function apiBaseUrl(): string {
    return BASE_URL;
}

export async function bootstrap(reference: string, appareil: string, timeoutMs = 15000): Promise<BootstrapResponse> {
    const { data } = await http.post<BootstrapResponse>('/api/desktop/bootstrap', { reference, appareil }, { timeout: timeoutMs });
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
    timeoutMs = 10000,
): Promise<ReponseLicenceDesktop> {
    const { data } = await http.post<ReponseLicenceDesktop>(
        '/api/desktop/licence/reclamer',
        { reference, appareil, licence_uuid: licenceUuid ?? null },
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
    await http.post('/api/desktop/sync', operation, {
        timeout: timeoutMs,
        headers: {
            Authorization: `Bearer ${token}`,
        },
    });
}
