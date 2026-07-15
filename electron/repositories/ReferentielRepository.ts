import { getDb } from '../database/connection';

export interface VilleRow {
    id: number;
    uuid: string;
    nom: string;
}

export interface ItineraireRow {
    id: number;
    uuid: string;
    nom: string | null;
    ville_depart_id: number;
    ville_arrivee_id: number;
    ville_depart_nom: string;
    ville_arrivee_nom: string;
}

export interface ChauffeurRow {
    id: number;
    uuid: string;
    nom: string;
    telephone?: string | null;
    numero_permis?: string | null;
    statut?: string;
}

export interface VehiculeRow {
    id: number;
    uuid: string;
    immatriculation: string;
    nombre_places: number;
    marque?: string | null;
    modele?: string | null;
    statut?: string;
}

export interface TarifCatalogueRow {
    uuid: string;
    trajet: string | null;
    type_billet: string;
    tarification: string;
    montant: number;
    actif: number;
}

export interface AgenceOption {
    id: number;
    uuid: string;
    nom: string;
    ville_id: number;
}

export interface VoyageOption {
    id: number;
    uuid: string;
    date_depart: string;
    heure_depart: string;
    itineraire_nom: string | null;
}

export class ReferentielRepository {
    villes(): VilleRow[] {
        return getDb().prepare('SELECT id, uuid, nom FROM villes WHERE actif = 1 ORDER BY nom').all() as VilleRow[];
    }

    // Une ville peut contenir plusieurs agences (ex : Abidjan → Yopougon,
    // Adjamé...) : on les propose une fois la ville de destination choisie.
    agencesParVille(villeId: number): AgenceOption[] {
        return getDb()
            .prepare('SELECT id, uuid, nom, ville_id FROM agences WHERE ville_id = ? AND actif = 1 ORDER BY nom')
            .all(villeId) as AgenceOption[];
    }

    // Voyages programmés au départ de l'agence, pour lier (facultativement)
    // un bagage ou un courrier au voyage par lequel il part.
    voyagesDeAgence(agenceId: number): VoyageOption[] {
        return getDb()
            .prepare(
                `SELECT v.id, v.uuid, v.date_depart, v.heure_depart, i.nom AS itineraire_nom
                 FROM voyages v
                 JOIN itineraires i ON i.id = v.itineraire_id
                 WHERE v.agence_depart_id = ? AND v.statut = 'programme'
                 ORDER BY v.date_depart ASC, v.heure_depart ASC`,
            )
            .all(agenceId) as VoyageOption[];
    }

    itineraires(): ItineraireRow[] {
        return getDb()
            .prepare(
                `SELECT i.id, i.uuid, i.nom, i.ville_depart_id, i.ville_arrivee_id,
                        vd.nom AS ville_depart_nom, va.nom AS ville_arrivee_nom
                 FROM itineraires i
                 JOIN villes vd ON vd.id = i.ville_depart_id
                 JOIN villes va ON va.id = i.ville_arrivee_id
                 WHERE i.actif = 1
                 ORDER BY vd.nom, va.nom`,
            )
            .all() as ItineraireRow[];
    }

    chauffeurs(_agenceId: number): ChauffeurRow[] {
        return getDb()
            .prepare(
                `SELECT id, uuid, nom
                 FROM chauffeurs
                 WHERE statut = 'disponible'
                 ORDER BY nom`,
            )
            .all() as ChauffeurRow[];
    }

    vehicules(_agenceId: number): VehiculeRow[] {
        return getDb()
            .prepare(
                `SELECT id, uuid, immatriculation, nombre_places
                 FROM vehicules
                 WHERE statut = 'disponible'
                 ORDER BY immatriculation`,
            )
            .all() as VehiculeRow[];
    }

    tarifsAgence(agenceId: number): TarifCatalogueRow[] {
        return getDb()
            .prepare(
                `SELECT t.uuid, tr.nom AS trajet, t.type_billet, t.tarification, t.montant, t.actif
                 FROM tarifs t
                 JOIN trajets tr ON tr.id = t.trajet_id
                 WHERE t.agence_id = ?
                 ORDER BY tr.nom, t.tarification, t.type_billet`,
            )
            .all(agenceId) as TarifCatalogueRow[];
    }

    chauffeursCatalogue(): ChauffeurRow[] {
        return getDb()
            .prepare(
                `SELECT id, uuid, nom, telephone, numero_permis, statut
                 FROM chauffeurs
                 ORDER BY nom`,
            )
            .all() as ChauffeurRow[];
    }

    vehiculesCatalogue(): VehiculeRow[] {
        return getDb()
            .prepare(
                `SELECT id, uuid, immatriculation, marque, modele, nombre_places, statut
                 FROM vehicules
                 ORDER BY immatriculation`,
            )
            .all() as VehiculeRow[];
    }
}
