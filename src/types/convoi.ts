export type StatutConvoi = 'programme' | 'parti' | 'termine' | 'annule';

export interface Convoi {
    uuid: string;
    reference: string;
    agence_id: number;
    agence: string;
    ville_depart: string;
    ville_destination_id: number;
    destination: string;
    precision_destination: string;
    nombre_places: number;
    montant_fixe: number;
    date_depart: string;
    heure_depart: string;
    date_retour: string;
    heure_retour: string | null;
    statut: StatutConvoi;
    cree_par: string | null;
}
