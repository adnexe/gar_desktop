export interface CourrierInternationalDuJour {
    uuid: string;
    numero_courrier: string;
    heure: string;
    destination: string;
    pays_destination: string;
    ville_destination: string;
    destinataire: string;
    destinataire_telephone?: string | null;
    expediteur?: string | null;
    expediteur_telephone?: string | null;
    montant_total: number;
    valeur_colis: number;
}

