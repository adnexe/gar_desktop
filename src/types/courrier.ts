export interface CourrierDuJour {
    uuid: string;
    numero_courrier: string;
    heure: string;
    destination: string;
    destinataire: string;
    destinataire_telephone?: string | null;
    expediteur?: string | null;
    expediteur_telephone?: string | null;
    montant_total: number;
    montant_colis: number;
}
