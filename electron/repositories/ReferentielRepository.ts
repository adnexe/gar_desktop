import { getDb } from '../database/connection';

export interface VilleRow {
    id: number;
    uuid: string;
    nom: string;
    pays_id?: number | null;
}

export interface PaysRow {
    id: number;
    uuid: string;
    nom: string;
    code: string;
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
    telephone: string | null;
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
        return getDb().prepare('SELECT id, uuid, nom, pays_id FROM villes WHERE actif = 1 ORDER BY nom').all() as VilleRow[];
    }

    pays(): PaysRow[] {
        return getDb().prepare('SELECT id, uuid, nom, code FROM pays WHERE actif = 1 ORDER BY nom').all() as PaysRow[];
    }

    villesParPays(paysId: number): VilleRow[] {
        return getDb()
            .prepare('SELECT id, uuid, nom, pays_id FROM villes WHERE actif = 1 AND pays_id = ? ORDER BY nom')
            .all(paysId) as VilleRow[];
    }

    // Une ville peut contenir plusieurs agences (ex : Abidjan → Yopougon,
    // Adjamé...) : on les propose une fois la ville de destination choisie.
    agencesParVille(villeId: number): AgenceOption[] {
        return getDb()
            .prepare('SELECT id, uuid, nom, ville_id, telephone FROM agences WHERE ville_id = ? AND actif = 1 ORDER BY nom')
            .all(villeId) as AgenceOption[];
    }

    // Voyages programmés au départ de l'agence, pour lier (facultativement)
    // un bagage ou un courrier au voyage par lequel il part. Nom d'itinéraire
    // réorienté (ville de l'agence à gauche) : voir itineraires() ci-dessous.
    voyagesDeAgence(agenceId: number): VoyageOption[] {
        return getDb()
            .prepare(
                `SELECT v.id, v.uuid, v.date_depart, v.heure_depart,
                        (agv.nom || ' - ' || CASE WHEN i.ville_depart_id = agv.id THEN va.nom ELSE vd.nom END) AS itineraire_nom
                 FROM voyages v
                 JOIN itineraires i ON i.id = v.itineraire_id
                 JOIN villes vd ON vd.id = i.ville_depart_id
                 JOIN villes va ON va.id = i.ville_arrivee_id
                 JOIN agences a ON a.id = v.agence_depart_id
                 JOIN villes agv ON agv.id = a.ville_id
                 WHERE v.agence_depart_id = ? AND v.statut = 'programme'
                 ORDER BY v.date_depart ASC, v.heure_depart ASC`,
            )
            .all(agenceId) as VoyageOption[];
    }

    // Un itinéraire est bidirectionnel en base (même règle que les trajets :
    // "Abidjan-Man" et "Man-Abidjan" sont le même itinéraire), donc on ne
    // propose que ceux reliés à la ville de l'agence, réorientés pour que
    // cette ville soit toujours le départ — jamais listée comme destination,
    // comme c'est déjà le cas pour la vente de ticket et le courrier.
    itineraires(agenceId: number): ItineraireRow[] {
        return getDb()
            .prepare(
                `SELECT i.id, i.uuid, i.ville_depart_id, i.ville_arrivee_id,
                        agv.nom AS ville_depart_nom,
                        CASE WHEN i.ville_depart_id = agv.id THEN va.nom ELSE vd.nom END AS ville_arrivee_nom,
                        (agv.nom || ' - ' || CASE WHEN i.ville_depart_id = agv.id THEN va.nom ELSE vd.nom END) AS nom
                 FROM itineraires i
                 JOIN villes vd ON vd.id = i.ville_depart_id
                 JOIN villes va ON va.id = i.ville_arrivee_id
                 JOIN agences a ON a.id = ?
                 JOIN villes agv ON agv.id = a.ville_id
                 WHERE i.actif = 1
                   AND (i.ville_depart_id = agv.id OR i.ville_arrivee_id = agv.id)
                 ORDER BY ville_arrivee_nom`,
            )
            .all(agenceId) as ItineraireRow[];
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

    // Ville de l'agence à gauche (voir TrajetRepository.resoudreBidirectionnel) :
    // un trajet est bidirectionnel en base, "tr.nom" seul afficherait parfois
    // le sens inverse selon l'agence propriétaire du tarif.
    tarifsAgence(agenceId: number): TarifCatalogueRow[] {
        return getDb()
            .prepare(
                `SELECT t.uuid,
                        (agv.nom || ' - ' || CASE WHEN tr.ville_depart_id = agv.id THEN vva.nom ELSE vvd.nom END) AS trajet,
                        t.type_billet, t.tarification, t.montant, t.actif
                 FROM tarifs t
                 JOIN trajets tr ON tr.id = t.trajet_id
                 JOIN villes vvd ON vvd.id = tr.ville_depart_id
                 JOIN villes vva ON vva.id = tr.ville_arrivee_id
                 JOIN agences a ON a.id = t.agence_id
                 JOIN villes agv ON agv.id = a.ville_id
                 WHERE t.agence_id = ?
                 ORDER BY trajet, t.tarification, t.type_billet`,
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
