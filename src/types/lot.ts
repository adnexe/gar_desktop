import type { LigneBordereauBagage, LigneBordereauCourrier } from '@/Components/BordereauA4.vue';

export type TypeLot = 'courrier' | 'bagage' | 'courrier_international';
export type StatutLot = 'en_preparation' | 'expedie' | 'arrive' | 'livre';

export interface ElementLotEligible {
    uuid: string;
    numero: string;
    destination: string;
    voyage_uuid: string | null;
    voyage: string | null;
    groupe: string;
    principal: string;
    telephone: string | null;
    contenu: string | null;
    montant: number;
}

export interface LotResume {
    uuid: string;
    type: TypeLot;
    numero_lot: number;
    reference: string;
    date_operation: string;
    destination: string;
    voyage_libelle: string | null;
    statut: StatutLot;
    nombre_elements: number;
    montant_total: number;
    cree_par: string | null;
    created_at: string;
}

export interface DetailsLot extends LotResume {
    courriers: LigneBordereauCourrier[];
    bagages: LigneBordereauBagage[];
}
