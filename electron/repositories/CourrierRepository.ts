import { getDb } from '../database/connection';
import { nouvelUuid } from '../database/ids';
import { genererNumeroCourrier, prevoirNumeroCourrier } from '../database/numero';
import { queueManager } from '../sync/QueueManager';
import { ConfigRepository } from './ConfigRepository';
import { maintenantCaisseIso } from '../database/dates';

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
    numeroCourrier?: string | null;
}

export interface CourrierDuJour {
    uuid: string;
    numero_courrier: string;
    heure: string;
    destination: string;
    destinataire: string;
    montant_total: number;
    montant_colis: number;
}

export class CourrierRepository {
    private readonly config = new ConfigRepository();

    private codeAgenceTicket(agenceId: number): string | null {
        const ligne = getDb()
            .prepare('SELECT code_ticket FROM agences WHERE id = ? LIMIT 1')
            .get(agenceId) as { code_ticket: string | null } | undefined;

        return ligne?.code_ticket ?? null;
    }

    prochainNumeroPrepare(agenceId: number): string | null {
        return prevoirNumeroCourrier(getDb(), this.config.obtenir('licence_code_poste'), this.codeAgenceTicket(agenceId));
    }

    duJour(agenceId: number, date?: string, userId?: number | null): CourrierDuJour[] {
        return getDb()
            .prepare(
                `SELECT c.uuid, c.numero_courrier, time(c.created_at) AS heure, v.nom AS destination,
                        (cl.prenoms || ' ' || cl.nom) AS destinataire, cl.telephone AS destinataire_telephone,
                        (ex.prenoms || ' ' || ex.nom) AS expediteur, ex.telephone AS expediteur_telephone,
                        c.montant_total, c.montant_colis
                 FROM courriers c
                 JOIN villes v ON v.id = c.ville_arrivee_id
                 JOIN clients cl ON cl.id = c.destinataire_id
                 JOIN clients ex ON ex.id = c.expediteur_id
                 WHERE c.agence_depart_id = ? AND date(c.created_at) = date(?)
                  AND c.statut = 'enregistre'
                  AND (? IS NULL OR c.user_id = ?)
                 ORDER BY c.created_at DESC`,
            )
            .all(agenceId, date ?? 'now', userId ?? null, userId ?? null) as CourrierDuJour[];
    }

    rapportDuJour(agenceId: number, date?: string, voyageId?: number | null, userId?: number | null): {
        destinations: { destination_id: number | null; destination: string; nombre_courriers: number; nombre_colis: number; montant_total: number; valeur_colis: number }[];
        nombre_courriers: number;
        nombre_colis: number;
        montant_total: number;
        valeur_colis: number;
        agents: string[];
    } {
        const db = getDb();
        const ligne = db
            .prepare(
                `SELECT COUNT(*) AS nombre_courriers,
                        COALESCE(SUM(montant_total), 0) AS montant_total,
                        COALESCE(SUM(montant_colis), 0) AS valeur_colis,
                        COALESCE((SELECT SUM(co.quantite) FROM colis co
                                  WHERE co.courrier_id IN (
                                      SELECT id FROM courriers
                                      WHERE agence_depart_id = ? AND date(created_at) = date(?) AND statut = 'enregistre'
                                        AND (? IS NULL OR voyage_id = ?)
                                        AND (? IS NULL OR user_id = ?)
                                  )), 0) AS nombre_colis
                 FROM courriers
                 WHERE agence_depart_id = ? AND date(created_at) = date(?) AND statut = 'enregistre'
                   AND (? IS NULL OR voyage_id = ?)
                   AND (? IS NULL OR user_id = ?)`,
            )
            .get(
                agenceId, date ?? 'now', voyageId ?? null, voyageId ?? null, userId ?? null, userId ?? null,
                agenceId, date ?? 'now', voyageId ?? null, voyageId ?? null, userId ?? null, userId ?? null,
            ) as { nombre_courriers: number; nombre_colis: number; montant_total: number; valeur_colis: number };

        const destinations = db
            .prepare(
                `SELECT c.ville_arrivee_id AS destination_id,
                        COALESCE(v.nom, 'Non renseignée') AS destination,
                        COUNT(c.id) AS nombre_courriers,
                        COALESCE(SUM((SELECT SUM(co.quantite) FROM colis co WHERE co.courrier_id = c.id)), 0) AS nombre_colis,
                        COALESCE(SUM(c.montant_total), 0) AS montant_total,
                        COALESCE(SUM(c.montant_colis), 0) AS valeur_colis
                 FROM courriers c
                 LEFT JOIN villes v ON v.id = c.ville_arrivee_id
                 WHERE c.agence_depart_id = ? AND date(c.created_at) = date(?) AND c.statut = 'enregistre'
                   AND (? IS NULL OR c.voyage_id = ?)
                   AND (? IS NULL OR c.user_id = ?)
                 GROUP BY c.ville_arrivee_id, v.nom
                 ORDER BY destination ASC`,
            )
            .all(agenceId, date ?? 'now', voyageId ?? null, voyageId ?? null, userId ?? null, userId ?? null) as { destination_id: number | null; destination: string; nombre_courriers: number; nombre_colis: number; montant_total: number; valeur_colis: number }[];

        const agents = (db
            .prepare(
                `SELECT DISTINCT u.name AS nom
                 FROM courriers c
                 JOIN users u ON u.id = c.user_id
                 WHERE c.agence_depart_id = ? AND date(c.created_at) = date(?) AND c.statut = 'enregistre'
                   AND (? IS NULL OR c.voyage_id = ?)
                   AND (? IS NULL OR c.user_id = ?)
                 ORDER BY u.name ASC`,
            )
            .all(agenceId, date ?? 'now', voyageId ?? null, voyageId ?? null, userId ?? null, userId ?? null) as { nom: string | null }[])
            .map((l) => l.nom)
            .filter((n): n is string => !!n);

        return { ...ligne, destinations, agents };
    }

    // Toutes les informations nécessaires pour réimprimer le reçu ou
    // l'étiquette d'un courrier déjà enregistré.
    details(uuid: string): {
        uuid: string;
        numero_courrier: string;
        destination: string;
        agence_arrivee: string | null;
        agence_arrivee_telephone: string | null;
        voyage: string | null;
        expediteur_nom: string;
        expediteur_telephone: string;
        destinataire_nom: string;
        destinataire_telephone: string;
        prix_expedition: number;
        montant_colis: number;
        montant_total: number;
        agence_depart: string | null;
        agence_depart_telephone: string | null;
        agent: string | null;
        created_at: string;
        colis: { nom: string; type: string; quantite: number; montant: number }[];
    } | null {
        const db = getDb();
        const ligne = db
            .prepare(
                `SELECT c.id, c.uuid, c.numero_courrier, v.nom AS destination,
                        aa.nom AS agence_arrivee, aa.telephone AS agence_arrivee_telephone,
                        CASE WHEN vy.id IS NULL THEN NULL
                             ELSE vy.date_depart || ' ' || substr(vy.heure_depart, 1, 5) END AS voyage,
                        TRIM(COALESCE(ex.prenoms, '') || ' ' || COALESCE(ex.nom, '')) AS expediteur_nom,
                        COALESCE(ex.telephone, '') AS expediteur_telephone,
                        TRIM(COALESCE(cl.prenoms, '') || ' ' || COALESCE(cl.nom, '')) AS destinataire_nom,
                        COALESCE(cl.telephone, '') AS destinataire_telephone,
                        c.prix_expedition, c.montant_colis, c.montant_total,
                        ad.nom AS agence_depart, ad.telephone AS agence_depart_telephone, u.name AS agent, c.created_at
                 FROM courriers c
                 JOIN villes v ON v.id = c.ville_arrivee_id
                 JOIN clients ex ON ex.id = c.expediteur_id
                 JOIN clients cl ON cl.id = c.destinataire_id
                 LEFT JOIN agences aa ON aa.id = c.agence_arrivee_id
                 LEFT JOIN agences ad ON ad.id = c.agence_depart_id
                 LEFT JOIN voyages vy ON vy.id = c.voyage_id
                 LEFT JOIN users u ON u.id = c.user_id
                 WHERE c.uuid = ?`,
            )
            .get(uuid) as ({ id: number } & Record<string, unknown>) | undefined;

        if (!ligne) return null;

        const colis = db
            .prepare(`SELECT nom, type, quantite, montant FROM colis WHERE courrier_id = ? ORDER BY id ASC`)
            .all(ligne.id) as { nom: string; type: string; quantite: number; montant: number }[];

        const { id: _id, ...reste } = ligne;
        return { ...reste, colis } as never;
    }

    creer(donnees: NouveauCourrier): { id: number; uuid: string; numeroCourrier: string; montantColis: number; montantTotal: number; created_at: string } {
        const db = getDb();
        const uuid = nouvelUuid();
        const numeroCourrier = genererNumeroCourrier(
            db,
            this.config.obtenir('licence_code_poste'),
            this.codeAgenceTicket(donnees.agenceDepartId),
            donnees.numeroCourrier,
        );
        const maintenant = maintenantCaisseIso();

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

            return { id: courrierId, uuid, numeroCourrier, montantColis, montantTotal, created_at: maintenant };
        })();
    }

    confirmerImpression(uuid: string): boolean {
        const db = getDb();
        const maintenant = maintenantCaisseIso();

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
        const maintenant = maintenantCaisseIso();
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
