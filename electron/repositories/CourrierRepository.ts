import { getDb } from '../database/connection';
import { nouvelUuid } from '../database/ids';
import { genererNumeroUnique } from '../database/numero';
import { queueManager } from '../sync/QueueManager';

export interface LigneColis {
    nom: string;
    type: string;
    quantite: number;
    prix: number;
}

export interface NouveauCourrier {
    agenceDepartId: number;
    villeArriveeId: number;
    agenceArriveeId: number | null;
    voyageId: number | null;
    voyageUuid: string | null;
    expediteurId: number;
    destinataireId: number;
    userId: number;
    agentId: number | null;
    prixExpedition: number;
    colis: LigneColis[];
}

export interface CourrierDuJour {
    uuid: string;
    numero_courrier: string;
    heure: string;
    destination: string;
    destinataire: string;
    montant_total: number;
}

export class CourrierRepository {
    duJour(agenceId: number, date?: string): CourrierDuJour[] {
        return getDb()
            .prepare(
                `SELECT c.uuid, c.numero_courrier, time(c.created_at) AS heure, v.nom AS destination,
                        (cl.prenoms || ' ' || cl.nom) AS destinataire, cl.telephone AS destinataire_telephone,
                        (ex.prenoms || ' ' || ex.nom) AS expediteur, ex.telephone AS expediteur_telephone, c.montant_total
                 FROM courriers c
                 JOIN villes v ON v.id = c.ville_arrivee_id
                 JOIN clients cl ON cl.id = c.destinataire_id
                 JOIN clients ex ON ex.id = c.expediteur_id
                 WHERE c.agence_depart_id = ? AND date(c.created_at) = date(?)
                  AND c.statut = 'enregistre'
                 ORDER BY c.created_at DESC`,
            )
            .all(agenceId, date ?? 'now') as CourrierDuJour[];
    }

    rapportDuJour(agenceId: number, date?: string): {
        destinations: { destination_id: number | null; destination: string; nombre_courriers: number; montant_total: number }[];
        nombre_courriers: number;
        montant_total: number;
    } {
        const db = getDb();
        const ligne = db
            .prepare(
                `SELECT COUNT(*) AS nombre_courriers, COALESCE(SUM(montant_total), 0) AS montant_total
                 FROM courriers
                 WHERE agence_depart_id = ? AND date(created_at) = date(?) AND statut = 'enregistre'`,
            )
            .get(agenceId, date ?? 'now') as { nombre_courriers: number; montant_total: number };

        const destinations = db
            .prepare(
                `SELECT c.ville_arrivee_id AS destination_id,
                        COALESCE(v.nom, 'Non renseignée') AS destination,
                        COUNT(c.id) AS nombre_courriers,
                        COALESCE(SUM(c.montant_total), 0) AS montant_total
                 FROM courriers c
                 LEFT JOIN villes v ON v.id = c.ville_arrivee_id
                 WHERE c.agence_depart_id = ? AND date(c.created_at) = date(?) AND c.statut = 'enregistre'
                 GROUP BY c.ville_arrivee_id, v.nom
                 ORDER BY destination ASC`,
            )
            .all(agenceId, date ?? 'now') as { destination_id: number | null; destination: string; nombre_courriers: number; montant_total: number }[];

        return { ...ligne, destinations };
    }

    creer(donnees: NouveauCourrier): { id: number; uuid: string; numeroCourrier: string; montantColis: number; montantTotal: number } {
        const db = getDb();
        const uuid = nouvelUuid();
        const numeroCourrier = genererNumeroUnique(db, 'courriers', 'numero_courrier');
        const maintenant = new Date().toISOString();

        const montantColis = donnees.colis.reduce((total, ligne) => total + ligne.quantite * ligne.prix, 0);
        // Le client ne paie QUE les frais d'expédition. La valeur des colis
        // (montantColis) est une valeur déclarée, jamais encaissée.
        const montantTotal = donnees.prixExpedition;

        return db.transaction(() => {
            const info = db
                .prepare(
                    `INSERT INTO courriers (uuid, numero_courrier, agence_depart_id, ville_arrivee_id, agence_arrivee_id, voyage_id, voyage_uuid, expediteur_id, destinataire_id, user_id, agent_id, prix_expedition, montant_colis, montant_total, statut, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'impression_en_attente', ?, ?)`,
                )
                .run(
                    uuid,
                    numeroCourrier,
                    donnees.agenceDepartId,
                    donnees.villeArriveeId,
                    donnees.agenceArriveeId,
                    donnees.voyageId,
                    donnees.voyageUuid,
                    donnees.expediteurId,
                    donnees.destinataireId,
                    donnees.userId,
                    donnees.agentId,
                    donnees.prixExpedition,
                    montantColis,
                    montantTotal,
                    maintenant,
                    maintenant,
                );

            const courrierId = Number(info.lastInsertRowid);

            const colisStmt = db.prepare(
                `INSERT INTO colis (uuid, courrier_id, nom, type, quantite, prix, montant, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            );
            for (const ligne of donnees.colis) {
                const colisUuid = nouvelUuid();
                colisStmt.run(
                    colisUuid,
                    courrierId,
                    ligne.nom,
                    ligne.type,
                    ligne.quantite,
                    ligne.prix,
                    ligne.quantite * ligne.prix,
                    maintenant,
                    maintenant,
                );
            }

            return { id: courrierId, uuid, numeroCourrier, montantColis, montantTotal };
        })();
    }

    confirmerImpression(uuid: string): boolean {
        const db = getDb();
        const maintenant = new Date().toISOString();

        return db.transaction(() => {
            const dejaValide = db
                .prepare(`SELECT 1 FROM courriers WHERE uuid = ? AND statut = 'enregistre' LIMIT 1`)
                .get(uuid);

            if (dejaValide) {
                return true;
            }

            const info = db
                .prepare(
                    `UPDATE courriers
                     SET statut = 'enregistre',
                         impression_confirmee_at = ?,
                         updated_at = ?
                     WHERE uuid = ? AND statut = 'impression_en_attente'`,
                )
                .run(maintenant, maintenant, uuid);

            if (info.changes === 0) {
                return false;
            }

            queueManager.ajouter('courriers', uuid, { uuid }, 'create');
            return true;
        })();
    }

    annulerImpression(uuid: string, motif: string): boolean {
        const maintenant = new Date().toISOString();
        const motifCourt = motif.trim().slice(0, 500) || 'Impression non confirmee';

        const info = getDb()
            .prepare(
                `UPDATE courriers
                 SET statut = 'annule',
                     annule_at = ?,
                     motif_annulation = ?,
                     updated_at = ?
                 WHERE uuid = ? AND statut = 'impression_en_attente'`,
            )
            .run(maintenant, motifCourt, maintenant, uuid);

        return info.changes > 0;
    }
}
