export interface VenteDuJour {
    uuid: string;
    numero_ticket: string;
    heure: string;
    trajet: string;
    numero_place: number;
    type_billet: string;
    montant: number;
    timbre: number;
    total: number;
    client: string | null;
    client_telephone?: string | null;
}
