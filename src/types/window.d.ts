export {};

// Miroir de electron/preload.ts (déclaré indépendamment pour ne pas coupler
// les projets TS renderer/main). Les payloads précis sont typés au niveau
// des Services du renderer (src/Services/*), pas ici.
declare global {
    interface Window {
        api: {
            config: {
                estConfiguree: () => Promise<boolean>;
                agenceActuelle: () => Promise<{ id: number; uuid: string; reference: string; telephone: string | null; nom: string; ville_id: number; ville_nom: string } | null>;
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
                    modules_actifs: string[];
                }>;
                licenceActuelle: () => Promise<{
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
                } | null>;
                reclamerLicence: (reference: string, appareil: string, codePoste?: string | null) => Promise<{
                verifierLicence: () => Promise<unknown>;
                    ok: boolean;
                    statut: string;
                    message: string;
                    licence?: {
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
                    };
                }>;
                configurer: (reference: string, appareil: string, codePoste?: string | null) => Promise<unknown>;
                actualiser: () => Promise<{ ok: boolean; agence?: unknown; erreur?: string; baseUrl?: string }>;
                synchroniserMaintenant: () => Promise<{
                    ok: boolean;
                    enAttente: number;
                    erreur: { entite: string; tentatives: number; derniere_erreur: string | null } | null;
                }>;
                reseauLocal: () => Promise<{
                    mode: 'autonome' | 'serveur' | 'client';
                    serveurUrl: string | null;
                    port: number;
                    secret: string | null;
                    actif: boolean;
                    adresses: string[];
                    agence: string | null;
                }>;
                relancerServeurLocal: () => Promise<{
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
                    acteurUserId?: number | null;
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
                nettoyerDonneesTest: (acteurUserId: number) => Promise<{
                    ok: boolean;
                    suppressions: Record<string, number>;
                    message: string;
                }>;
                resetComplet: (acteurUserId: number) => Promise<{
                    ok: boolean;
                    suppressions: Record<string, number>;
                    message: string;
                }>;
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
                verifierSession: (userId: number) => Promise<{ ok: true } | { ok: false; raison: string }>;
            };
            agents: {
                lister: (agenceId: number) => Promise<{
                    id: number;
                    uuid: string;
                    nom: string;
                    telephone: string | null;
                    role: string;
                    type_agent: string[];
                    actif: boolean;
                    desactive_localement: boolean;
                    user_id: number | null;
                    user_uuid: string | null;
                    user_email: string | null;
                    user_number: string | null;
                    user_actif: boolean | null;
                    user_desactive_localement: boolean | null;
                }[]>;
                desactiver: (agentUuid: string, acteurUserId: number) => Promise<{ ok: boolean }>;
                reactiver: (agentUuid: string, acteurUserId: number) => Promise<{ ok: boolean }>;
                supprimerLocalement: (agentUuid: string, acteurUserId: number) => Promise<{ ok: boolean }>;
            };
            referentiel: {
                villes: () => Promise<{ id: number; uuid: string; nom: string }[]>;
                pays: () => Promise<{ id: number; uuid: string; nom: string; code: string }[]>;
                villesParPays: (paysId: number) => Promise<{ id: number; uuid: string; nom: string; pays_id: number | null }[]>;
                agencesParVille: (villeId: number) => Promise<{ id: number; uuid: string; nom: string; ville_id: number }[]>;
                voyagesDeAgence: (agenceId: number) => Promise<{ id: number; uuid: string; date_depart: string; heure_depart: string; itineraire_nom: string | null }[]>;
                tarifsAgence: (agenceId: number) => Promise<{
                    uuid: string;
                    trajet: string | null;
                    type_billet: string;
                    tarification: string;
                    montant: number;
                    actif: number;
                }[]>;
                chauffeurs: () => Promise<{
                    id: number;
                    uuid: string;
                    nom: string;
                    telephone: string | null;
                    numero_permis: string | null;
                    statut: string;
                }[]>;
                vehicules: () => Promise<{
                    id: number;
                    uuid: string;
                    immatriculation: string;
                    marque: string | null;
                    modele: string | null;
                    nombre_places: number;
                    statut: string;
                }[]>;
            };
            vente: {
                rechercherVoyages: (params: { agenceId: number; villeDepartId: number; villeArriveeId: number }) => Promise<unknown>;
                rechercherClient: (telephone: string) => Promise<unknown>;
                preparerNumero: () => Promise<string | null>;
                vendre: (demande: unknown) => Promise<{ ok: boolean; ticket?: unknown; erreur?: string }>;
                confirmerImpression: (uuid: string) => Promise<{ ok: boolean; erreur?: string }>;
                annulerImpression: (uuid: string, motif: string) => Promise<{ ok: boolean }>;
                ventesDuJour: (agenceId: number, date?: string, userId?: number | null) => Promise<unknown[]>;
                finDeCaisse: (agenceId: number, date?: string, userId?: number | null, voyageId?: number | null) => Promise<unknown>;
                voyagesFinDeCaisse: (agenceId: number, date?: string) => Promise<unknown[]>;
            };
            impression: {
                imprimerTicket: (hauteurMm?: number) => Promise<{ ok: boolean; erreur?: string }>;
                imprimerRecu: (hauteurMm?: number) => Promise<{ ok: boolean; erreur?: string }>;
                preparerPdf: (hauteurMm?: number) => Promise<{ ok: true; id: string } | { ok: false; erreur: string }>;
                imprimerPdfPrepare: (id: string) => Promise<{ ok: boolean; erreur?: string; imprimante?: string }>;
                supprimerPdfPrepare: (id: string) => Promise<{ ok: boolean }>;
                verifierDisponible: () => Promise<{ ok: boolean; erreur?: string; imprimante?: string }>;
                listerImprimantes: () => Promise<{
                    name: string;
                    displayName: string;
                    description: string;
                    isDefault: boolean;
                    status: number | null;
                }[]>;
                tester: () => Promise<{ ok: boolean; erreur?: string; imprimante?: string }>;
            };
            bagage: {
                rechercherTicket: (code: string) => Promise<unknown>;
                preparerNumero: (agenceId: number) => Promise<string | null>;
                enregistrer: (demande: unknown) => Promise<{ ok: boolean; bagage?: unknown; erreur?: string }>;
                confirmerImpression: (uuid: string) => Promise<{ ok: boolean; erreur?: string }>;
                annulerImpression: (uuid: string, motif: string) => Promise<{ ok: boolean }>;
                duJour: (agenceId: number, date?: string, userId?: number | null) => Promise<unknown[]>;
                details: (uuid: string) => Promise<unknown>;
                finDeCaisse: (agenceId: number, date?: string, voyageId?: number | null, userId?: number | null) => Promise<unknown>;
            };
            courrier: {
                preparerNumero: (agenceId: number) => Promise<string | null>;
                enregistrer: (demande: unknown) => Promise<unknown>;
                confirmerImpression: (uuid: string) => Promise<{ ok: boolean; erreur?: string }>;
                annulerImpression: (uuid: string, motif: string) => Promise<{ ok: boolean }>;
                duJour: (agenceId: number, date?: string, userId?: number | null) => Promise<unknown[]>;
                details: (uuid: string) => Promise<unknown>;
                finDeCaisse: (agenceId: number, date?: string, voyageId?: number | null, userId?: number | null) => Promise<unknown>;
            };
            courrierInternational: {
                preparerNumero: (agenceId: number) => Promise<string | null>;
                enregistrer: (demande: unknown) => Promise<{ ok: boolean; courrier?: unknown; erreur?: string }>;
                confirmerImpression: (uuid: string) => Promise<{ ok: boolean; erreur?: string }>;
                annulerImpression: (uuid: string, motif: string) => Promise<{ ok: boolean }>;
                duJour: (agenceId: number, date?: string, userId?: number | null) => Promise<unknown[]>;
                details: (uuid: string) => Promise<unknown>;
                finDeCaisse: (agenceId: number, date?: string, userId?: number | null) => Promise<unknown>;
            };
            voyage: {
                formulaire: (agenceId: number) => Promise<unknown>;
                creer: (donnees: unknown) => Promise<unknown>;
                details: (uuid: string) => Promise<unknown>;
                modifier: (uuid: string, donnees: unknown) => Promise<{ ok: boolean; id?: number; uuid?: string; erreur?: string }>;
                liste: (agenceId: number, date?: string) => Promise<unknown[]>;
            };
            historique: {
                duJour: (agenceId: number, userId?: number | null) => Promise<unknown>;
            };
            diagnostic: {
                log: (niveau: 'info' | 'warn', message: string, contexte?: unknown) => Promise<{ ok: boolean }>;
            };
            miseAJour: {
                surMiseAJourPrete: (callback: (version: string) => void) => () => void;
            };
        };
    }
}
