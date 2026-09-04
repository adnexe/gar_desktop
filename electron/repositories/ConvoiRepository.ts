import { getDb } from '../database/connection';
import { nouvelUuid } from '../database/ids';
import { queueManager } from '../sync/QueueManager';
import { maintenantCaisseIso } from '../database/dates';
import { genererReferenceConvoi } from '../database/numero';
import { ConfigRepository } from './ConfigRepository';

export type StatutConvoi = 'programme' | 'parti' | 'termine' | 'annule';

export interface NouveauConvoi {
    agenceId: number;
    villeDestinationId: number;
    precisionDestination: string;
    nombrePlaces: number;
    montantFixe: number;
    dateDepart: string;
    heureDepart: string;
    dateRetour: string;
    heureRetour?: string | null;
    userId: number;
}

export interface ConvoiListe {
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
    date_retour: string | null;
    heure_retour: string | null;
    statut: StatutConvoi;
    cree_par: string | null;
}

export class ConvoiRepository {
    private readonly config = new ConfigRepository();

    lister(agenceId: number, date: string): ConvoiListe[] {
        return getDb().prepare(
            `SELECT c.uuid, c.reference, c.agence_id, a.nom AS agence, vd.nom AS ville_depart,
                    c.ville_destination_id, v.nom AS destination, c.precision_destination,
                    c.nombre_places, c.montant_fixe, c.date_depart, c.heure_depart,
                    c.date_retour, c.heure_retour, c.statut,
                    COALESCE(c.cree_par_nom, u.name) AS cree_par
             FROM convois c
             JOIN agences a ON a.id = c.agence_id
             JOIN villes vd ON vd.id = a.ville_id
             JOIN villes v ON v.id = c.ville_destination_id
             LEFT JOIN users u ON u.id = c.cree_par_user_id
             WHERE c.agence_id = ? AND date(c.date_depart) = date(?)
             ORDER BY c.heure_depart, c.created_at`,
        ).all(agenceId, date) as ConvoiListe[];
    }

    parUuid(uuid: string): ConvoiListe | null {
        return (getDb().prepare(
            `SELECT c.uuid, c.reference, c.agence_id, a.nom AS agence, vd.nom AS ville_depart,
                    c.ville_destination_id, v.nom AS destination, c.precision_destination,
                    c.nombre_places, c.montant_fixe, c.date_depart, c.heure_depart,
                    c.date_retour, c.heure_retour, c.statut,
                    COALESCE(c.cree_par_nom, u.name) AS cree_par
             FROM convois c
             JOIN agences a ON a.id = c.agence_id
             JOIN villes vd ON vd.id = a.ville_id
             JOIN villes v ON v.id = c.ville_destination_id
             LEFT JOIN users u ON u.id = c.cree_par_user_id
             WHERE c.uuid = ? LIMIT 1`,
        ).get(uuid) as ConvoiListe | undefined) ?? null;
    }

    creer(donnees: NouveauConvoi): ConvoiListe {
        const db = getDb();
        const uuid = nouvelUuid();
        const maintenant = maintenantCaisseIso();
        const agence = db.prepare('SELECT code_ticket FROM agences WHERE id = ?').get(donnees.agenceId) as { code_ticket: string | null } | undefined;
        if (!agence) throw new Error('AGENCE_CONVOI_INTROUVABLE');
        const reference = genererReferenceConvoi(
            db,
            this.config.obtenir('licence_code_poste'),
            agence.code_ticket,
        );
        const utilisateur = db.prepare('SELECT name FROM users WHERE id = ?').get(donnees.userId) as { name: string | null } | undefined;

        db.prepare(
            `INSERT INTO convois
                (uuid, reference, agence_id, ville_destination_id, precision_destination,
                 nombre_places, montant_fixe, date_depart, heure_depart, date_retour,
                 heure_retour, statut, cree_par_user_id, cree_par_nom, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'programme', ?, ?, ?, ?)`,
        ).run(
            uuid, reference, donnees.agenceId, donnees.villeDestinationId,
            donnees.precisionDestination.trim(), donnees.nombrePlaces, donnees.montantFixe,
            donnees.dateDepart, donnees.heureDepart, donnees.dateRetour,
            donnees.heureRetour || null, donnees.userId, utilisateur?.name ?? null,
            maintenant, maintenant,
        );

        queueManager.ajouter('convois', uuid, {}, 'create');
        return this.parUuid(uuid)!;
    }
}
