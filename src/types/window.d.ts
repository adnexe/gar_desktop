export {};

// Miroir de electron/preload.ts (déclaré indépendamment pour ne pas coupler
// les projets TS renderer/main). Les payloads précis sont typés au niveau
// des Services du renderer (src/Services/*), pas ici.
declare global {
    interface Window {
        api: {
            config: {
                estConfiguree: () => Promise<boolean>;
                agenceActuelle: () => Promise<{ id: number; uuid: string; reference: string; nom: string; ville_id: number; ville_nom: string } | null>;
                compagnieActuelle: () => Promise<{
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
                }>;
                licenceActuelle: () => Promise<{
                    uuid: string;
                    code: string;
                    agence_id: number;
                    date_debut: string;
                    date_expiration: string;
                    actif: boolean;
                    assigned_at: string | null;
                    assigned_device: string | null;
                    statut: string;
                } | null>;
                reclamerLicence: (reference: string, appareil: string) => Promise<{
                    ok: boolean;
                    statut: string;
                    message: string;
                    licence?: {
                        uuid: string;
                        code: string;
                        agence_id: number;
                        date_debut: string;
                        date_expiration: string;
                        actif: boolean;
                        assigned_at: string | null;
                        assigned_device: string | null;
                        statut: string;
                    };
                }>;
                configurer: (reference: string, appareil: string) => Promise<unknown>;
                actualiser: () => Promise<{ ok: boolean; agence?: unknown }>;
                reseauLocal: () => Promise<{
                    mode: 'autonome' | 'serveur' | 'client';
                    serveurUrl: string | null;
                    port: number;
                    secret: string | null;
                    actif: boolean;
                    adresses: string[];
                    agence: string | null;
                }>;
                configurerReseauLocal: (params: {
                    mode: 'autonome' | 'serveur' | 'client';
                    serveurUrl?: string | null;
                    port?: number | null;
                    secret?: string | null;
                }) => Promise<{
                    mode: 'autonome' | 'serveur' | 'client';
                    serveurUrl: string | null;
                    port: number;
                    secret: string | null;
                    actif: boolean;
                    adresses: string[];
                    agence: string | null;
                }>;
                testerReseauLocal: (serveurUrl: string, secret: string) => Promise<{ ok: boolean; message: string; agence?: string | null }>;
                actualiserVoyagesServeurLocal: (agenceId: number, date?: string | null) => Promise<{ ok: boolean; nombre: number; tickets: number; message: string }>;
            };
            auth: {
                connecter: (identifiant: string, motDePasse: string) => Promise<{
                    userId: number;
                    uuid: string;
                    nom: string;
                    role: string;
                    agentId: number | null;
                    agenceId: number | null;
                    typeAgent: string[];
                }>;
            };
            referentiel: {
                villes: () => Promise<{ id: number; uuid: string; nom: string }[]>;
                agencesParVille: (villeId: number) => Promise<{ id: number; uuid: string; nom: string; ville_id: number }[]>;
                voyagesDeAgence: (agenceId: number) => Promise<{ id: number; uuid: string; date_depart: string; heure_depart: string; itineraire_nom: string | null }[]>;
            };
            vente: {
                rechercherVoyages: (params: { agenceId: number; villeDepartId: number; villeArriveeId: number }) => Promise<unknown>;
                rechercherClient: (telephone: string) => Promise<unknown>;
                vendre: (demande: unknown) => Promise<{ ok: boolean; ticket?: unknown; erreur?: string }>;
                confirmerImpression: (uuid: string) => Promise<{ ok: boolean; erreur?: string }>;
                annulerImpression: (uuid: string, motif: string) => Promise<{ ok: boolean }>;
                ventesDuJour: (agenceId: number, date?: string) => Promise<unknown[]>;
                finDeCaisse: (agenceId: number, date?: string) => Promise<unknown>;
            };
            impression: {
                imprimerTicket: () => Promise<{ ok: boolean; erreur?: string }>;
                imprimerRecu: () => Promise<{ ok: boolean; erreur?: string }>;
            };
            bagage: {
                rechercherTicket: (code: string) => Promise<unknown>;
                enregistrer: (demande: unknown) => Promise<{ ok: boolean; bagage?: unknown; erreur?: string }>;
                confirmerImpression: (uuid: string) => Promise<{ ok: boolean; erreur?: string }>;
                annulerImpression: (uuid: string, motif: string) => Promise<{ ok: boolean }>;
                duJour: (agenceId: number, date?: string) => Promise<unknown[]>;
                finDeCaisse: (agenceId: number, date?: string) => Promise<unknown>;
            };
            courrier: {
                enregistrer: (demande: unknown) => Promise<unknown>;
                confirmerImpression: (uuid: string) => Promise<{ ok: boolean; erreur?: string }>;
                annulerImpression: (uuid: string, motif: string) => Promise<{ ok: boolean }>;
                duJour: (agenceId: number, date?: string) => Promise<unknown[]>;
                finDeCaisse: (agenceId: number, date?: string) => Promise<unknown>;
            };
            voyage: {
                formulaire: (agenceId: number) => Promise<unknown>;
                creer: (donnees: unknown) => Promise<unknown>;
                liste: (agenceId: number, date?: string) => Promise<unknown[]>;
            };
            historique: {
                duJour: (agenceId: number) => Promise<unknown>;
            };
        };
    }
}
