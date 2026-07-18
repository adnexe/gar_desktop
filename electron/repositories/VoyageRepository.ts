import { getDb } from '../database/connection';
import { nouvelUuid } from '../database/ids';
import { queueManager } from '../sync/QueueManager';

function dateDuJour(): string {
    const maintenant = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');

    return `${maintenant.getFullYear()}-${pad(maintenant.getMonth() + 1)}-${pad(maintenant.getDate())}`;
}

function dateComparable(date: string): string | null {
    const valeur = date.trim();
    const iso = valeur.match(/^(\d{4})-(\d{2})-(\d{2})/);

    if (iso) {
        return `${iso[1]}-${iso[2]}-${iso[3]}`;
    }

    const fr = valeur.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);

    if (fr) {
        return `${fr[3]}-${fr[2].padStart(2, '0')}-${fr[1].padStart(2, '0')}`;
    }

    const parsed = new Date(valeur);
    if (Number.isNaN(parsed.getTime())) {
        return null;
    }

    const pad = (n: number) => String(n).padStart(2, '0');

    return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`;
}

function dateNonPassee(date: string, reference = dateDuJour()): boolean {
    const depart = dateComparable(date);

    return depart !== null && depart >= reference;
}

export interface VoyageDisponible {
    id: number;
    uuid: string;
    date_depart: string;
    heure_depart: string;
    numero_depart: number;
    statut: string;
    itineraire_id: number;
    itineraire_nom: string | null;
    vehicule_immatriculation: string;
    nombre_places: number;
    chauffeur_nom: string | null;
    places_occupees: number[];
    premiere_place_libre: number | null;
}

export interface NouveauVoyage {
    agenceId: number;
    itineraireId: number;
    vehiculeId: number;
    chauffeurId: number | null;
    dateDepart: string;
    heureDepart: string;
    numeroDepart: number;
}

export interface VoyageListe {
    id: number;
    uuid: string;
    date_depart: string;
    heure_depart: string;
    numero_depart: number;
    statut: string;
    itineraire_nom: string | null;
    vehicule_immatriculation: string;
    nombre_places: number;
    chauffeur_nom: string | null;
    tickets_vendus: number;
}

export interface VoyageServeur {
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

export class VoyageRepository {
    // Liste des voyages de l'agence pour l'écran "Voyages" : aujourd'hui par défaut.
    liste(agenceId: number, date?: string): VoyageListe[] {
        const dateRecherche = date ?? dateDuJour();

        return getDb()
            .prepare(
                `SELECT v.id, v.uuid, v.date_depart, v.heure_depart, v.numero_depart, v.statut,
                        i.nom AS itineraire_nom, veh.immatriculation AS vehicule_immatriculation, veh.nombre_places,
                        c.nom AS chauffeur_nom,
                        (SELECT COUNT(*) FROM tickets t WHERE t.voyage_id = v.id AND t.statut_ticket = 'valide') AS tickets_vendus
                 FROM voyages v
                 JOIN itineraires i ON i.id = v.itineraire_id
                 JOIN vehicules veh ON veh.id = v.vehicule_id
                 LEFT JOIN chauffeurs c ON c.id = v.chauffeur_id
                 WHERE v.agence_depart_id = ? AND date(v.date_depart) = date(?)
                 ORDER BY v.heure_depart ASC, v.numero_depart ASC`,
            )
            .all(agenceId, dateRecherche) as VoyageListe[];
    }

    // Un voyage n'est proposé que si son itinéraire contient le trajet demandé
    // (via le pivot itineraire_trajet, rempli à la synchronisation), et
    // seulement s'il n'est pas déjà passé.
    disponiblesPourTrajet(agenceId: number, trajetId: number, date = dateDuJour()): VoyageDisponible[] {
        const db = getDb();

        const voyages = db
            .prepare(
                `SELECT v.id, v.uuid, v.date_depart, v.heure_depart, v.numero_depart, v.statut,
                        v.itineraire_id, i.nom AS itineraire_nom,
                        veh.immatriculation AS vehicule_immatriculation, veh.nombre_places,
                        c.nom AS chauffeur_nom
                 FROM voyages v
                 JOIN itineraires i ON i.id = v.itineraire_id
                 JOIN itineraire_trajet it ON it.itineraire_id = v.itineraire_id AND it.trajet_id = ?
                 JOIN vehicules veh ON veh.id = v.vehicule_id
                 LEFT JOIN chauffeurs c ON c.id = v.chauffeur_id
                 WHERE v.agence_depart_id = ? AND v.statut = 'programme'
                 ORDER BY v.date_depart ASC, v.heure_depart ASC, v.numero_depart ASC`,
            )
            .all(trajetId, agenceId) as Omit<VoyageDisponible, 'places_occupees'>[];

        const placesStmt = db.prepare(`SELECT numero_place FROM tickets WHERE voyage_id = ? AND statut_ticket <> 'annule'`);

        return voyages.filter((v) => dateNonPassee(v.date_depart, date)).map((v) => {
            const placesOccupees = (placesStmt.all(v.id) as { numero_place: number }[]).map((l) => l.numero_place);
            const occupeesSet = new Set(placesOccupees);
            let premierePlaceLibre: number | null = null;
            for (let n = 1; n <= v.nombre_places; n++) {
                if (!occupeesSet.has(n)) {
                    premierePlaceLibre = n;
                    break;
                }
            }

            return { ...v, places_occupees: placesOccupees, premiere_place_libre: premierePlaceLibre };
        });
    }

    creer(donnees: NouveauVoyage): { id: number; uuid: string } {
        const db = getDb();
        const uuid = nouvelUuid();
        const maintenant = new Date().toISOString();

        const info = db
            .prepare(
                `INSERT INTO voyages (uuid, agence_depart_id, itineraire_id, vehicule_id, chauffeur_id, date_depart, heure_depart, numero_depart, statut, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'programme', ?, ?)`,
            )
            .run(
                uuid,
                donnees.agenceId,
                donnees.itineraireId,
                donnees.vehiculeId,
                donnees.chauffeurId,
                donnees.dateDepart,
                donnees.heureDepart,
                donnees.numeroDepart,
                maintenant,
                maintenant,
            );

        const id = Number(info.lastInsertRowid);
        queueManager.ajouter('voyages', uuid, { ...donnees, uuid });

        return { id, uuid };
    }

    exporterPourClient(agenceId: number, date?: string | null): VoyageServeur[] {
        const dateRecherche = date?.trim();
        const filtreDate = dateRecherche
            ? 'AND date(v.date_depart) = date(@date)'
            : "AND date(v.date_depart) >= date('now')";

        return getDb()
            .prepare(
                `SELECT v.uuid, v.agence_depart_id, v.itineraire_id, v.vehicule_id, v.chauffeur_id,
                        v.date_depart, v.heure_depart, v.numero_depart, v.statut, v.created_at, v.updated_at
                 FROM voyages v
                 WHERE v.agence_depart_id = @agenceId
                   AND v.statut <> 'annule'
                   ${filtreDate}
                 ORDER BY v.date_depart ASC, v.heure_depart ASC, v.numero_depart ASC`,
            )
            .all({ agenceId, date: dateRecherche }) as VoyageServeur[];
    }

    importerDepuisServeur(voyages: VoyageServeur[]): number {
        if (!Array.isArray(voyages) || voyages.length === 0) return 0;

        const db = getDb();
        const maintenant = new Date().toISOString();
        const stmt = db.prepare(
            `INSERT INTO voyages (uuid, agence_depart_id, itineraire_id, vehicule_id, chauffeur_id, date_depart, heure_depart, numero_depart, statut, created_at, updated_at)
             VALUES (@uuid, @agence_depart_id, @itineraire_id, @vehicule_id, @chauffeur_id, @date_depart, @heure_depart, @numero_depart, @statut, @created_at, @updated_at)
             ON CONFLICT(uuid) DO UPDATE SET
                agence_depart_id = excluded.agence_depart_id,
                itineraire_id = excluded.itineraire_id,
                vehicule_id = excluded.vehicule_id,
                chauffeur_id = excluded.chauffeur_id,
                date_depart = excluded.date_depart,
                heure_depart = excluded.heure_depart,
                numero_depart = excluded.numero_depart,
                statut = excluded.statut,
                updated_at = excluded.updated_at`,
        );

        return db.transaction(() => {
            let nombre = 0;
            for (const voyage of voyages) {
                stmt.run({
                    ...voyage,
                    created_at: voyage.created_at ?? maintenant,
                    updated_at: voyage.updated_at ?? maintenant,
                });
                nombre++;
            }

            return nombre;
        })();
    }

    remplacerDepuisCaisseClient(agenceId: number, voyages: VoyageServeur[], date?: string | null): { importes: number; supprimes: number } {
        const importes = this.importerDepuisServeur(voyages);
        const uuidsServeur = voyages.map((voyage) => voyage.uuid).filter(Boolean);
        const supprimes = this.supprimerVoyagesFutursOrphelinsAbsents(agenceId, uuidsServeur, date);

        return { importes, supprimes };
    }

    private supprimerVoyagesFutursOrphelinsAbsents(agenceId: number, uuidsServeur: string[], date?: string | null): number {
        const dateRecherche = date?.trim();
        const filtreDate = dateRecherche
            ? 'date(date_depart) = date(?)'
            : "date(date_depart) >= date('now')";
        const filtreUuids = uuidsServeur.length > 0
            ? `AND uuid NOT IN (${uuidsServeur.map(() => '?').join(', ')})`
            : '';
        const params: unknown[] = dateRecherche
            ? [agenceId, dateRecherche, ...uuidsServeur]
            : [agenceId, ...uuidsServeur];

        const info = getDb()
            .prepare(
                `DELETE FROM voyages
                 WHERE agence_depart_id = ?
                   AND ${filtreDate}
                   ${filtreUuids}
                   AND NOT EXISTS (SELECT 1 FROM tickets t WHERE t.voyage_id = voyages.id)
                   AND NOT EXISTS (SELECT 1 FROM bagages b WHERE b.voyage_id = voyages.id)
                   AND NOT EXISTS (SELECT 1 FROM courriers c WHERE c.voyage_id = voyages.id)`,
            )
            .run(...params);

        return info.changes;
    }
}
