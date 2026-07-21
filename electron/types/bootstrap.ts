export interface VilleApi {
    id: number;
    uuid: string;
    nom: string;
    actif: boolean;
    created_at: string;
    updated_at: string;
}

export interface TrajetApi {
    id: number;
    uuid: string;
    ville_depart_id: number;
    ville_arrivee_id: number;
    nom: string | null;
    actif: boolean;
    created_at: string;
    updated_at: string;
    pivot?: { ordre_depart: number; ordre_arrivee: number };
}

export interface ItineraireApi {
    id: number;
    uuid: string;
    ville_depart_id: number;
    ville_arrivee_id: number;
    nom: string | null;
    actif: boolean;
    created_at: string;
    updated_at: string;
    trajets: TrajetApi[];
}

export interface TarifApi {
    id: number;
    uuid: string;
    agence_id: number;
    trajet_id: number;
    type_billet: string;
    tarification: string;
    montant: string | number;
    actif: boolean;
    created_at: string;
    updated_at: string;
}

export interface ChauffeurApi {
    id: number;
    uuid: string;
    agence_id: number | null;
    nom: string;
    telephone: string | null;
    numero_permis: string | null;
    statut: string;
    created_at: string;
    updated_at: string;
}

export interface VehiculeApi {
    id: number;
    uuid: string;
    agence_id: number | null;
    immatriculation: string;
    marque: string | null;
    modele: string | null;
    nombre_places: number;
    disposition_sieges: string | null;
    statut: string;
    created_at: string;
    updated_at: string;
}

export interface UserApi {
    id: number;
    uuid: string;
    agent_id: number | null;
    name: string | null;
    email: string | null;
    number: string | null;
    password: string;
    role: string;
    actif: boolean;
    created_at: string;
    updated_at: string;
}

export interface AgentApi {
    id: number;
    uuid: string;
    agence_id: number;
    nom: string;
    telephone: string | null;
    role: string;
    type_agent: string;
    actif: boolean;
    created_at: string;
    updated_at: string;
    user: UserApi | null;
}

export interface VoyageApi {
    uuid: string;
    agence_depart_id: number;
    itineraire_id: number;
    vehicule_id: number;
    chauffeur_id: number | null;
    date_depart: string;
    heure_depart: string;
    numero_depart: number;
    statut: string;
    created_at: string | null;
    updated_at: string | null;
}

export interface AgenceApi {
    id: number;
    uuid: string;
    reference: string;
    code_ticket: string | null;
    ville_id: number;
    nom: string;
    adresse: string | null;
    telephone: string | null;
    actif: boolean;
    created_at: string;
    updated_at: string;
}

export interface CompagnieApi {
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

export interface BootstrapResponse {
    agence: AgenceApi;
    agences?: AgenceApi[];
    compagnie: CompagnieApi;
    villes: VilleApi[];
    itineraires: ItineraireApi[];
    tarifs: TarifApi[];
    chauffeurs: ChauffeurApi[];
    vehicules: VehiculeApi[];
    voyages?: VoyageApi[];
    agents: AgentApi[];
    admin_users?: UserApi[];
    token: string;
}
