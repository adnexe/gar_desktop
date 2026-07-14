export interface BagageDuJour {
    uuid: string;
    numero_bagage: string;
    heure: string;
    numero_ticket: string | null;
    destination: string | null;
    description: string | null;
    valeur: number | null;
    montant: number;
}
