import { getDb } from '../database/connection';
import { nouvelUuid } from '../database/ids';
import { genererNumeroBagage, prevoirNumeroBagage } from '../database/numero';
import { queueManager } from '../sync/QueueManager';
import { ConfigRepository } from './ConfigRepository';

export interface NouveauBagage {
    agenceId: number;
    ticketId: number | null;
    ticketUuid: string | null;
    ticketNumero: string | null;
    villeArriveeId: number | null;
    voyageId: number | null;
    voyageUuid: string | null;
    clientId: number | null;
    userId: number;
    agentId: number | null;
    description: string | null;
    valeur: number | null;
    montant: number;
    numeroBagage?: string | null;
    createdAt?: string | null;
}

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

export class BagageRepository {
    private readonly config = new ConfigRepository();

    private codeAgenceTicket(agenceId: number): string | null {
        const ligne = getDb()
            .prepare('SELECT code_ticket FROM agences WHERE id = ? LIMIT 1')
            .get(agenceId) as { code_ticket: string | null } | undefined;

        return ligne?.code_ticket ?? null;
    }

    prochainNumeroPrepare(agenceId: number): string | null {
        return prevoirNumeroBagage(getDb(), this.config.obtenir('licence_code_poste'), this.codeAgenceTicket(agenceId));
    }

    duJour(agenceId: number, date?: string, userId?: number | null): BagageDuJour[] {
        return getDb()
            .prepare(
                `SELECT b.uuid, b.numero_bagage, time(b.created_at) AS heure, COALESCE(t.numero_ticket, b.ticket_numero) AS numero_ticket,
                        va.nom AS destination, b.description, b.valeur, b.montant,
                        COALESCE(NULLIF(TRIM(COALESCE(cb.prenoms, '') || ' ' || COALESCE(cb.nom, '')), ''),
                                 NULLIF(TRIM(COALESCE(cl.prenoms, '') || ' ' || COALESCE(cl.nom, '')), '')) AS client,
                        COALESCE(cb.telephone, cl.telephone) AS client_telephone
                 FROM bagages b
                 LEFT JOIN tickets t ON t.id = b.ticket_id
                 LEFT JOIN clients cl ON cl.id = t.client_id
                 LEFT JOIN clients cb ON cb.id = b.client_id
                 LEFT JOIN villes va ON va.id = b.ville_arrivee_id
                 WHERE b.agence_id = ? AND date(b.created_at) = date(?)
                  AND b.statut_paiement = 'paye'
                  AND (? IS NULL OR b.user_id = ?)
                 ORDER BY b.created_at DESC`,
            )
            .all(agenceId, date ?? 'now', userId ?? null, userId ?? null) as BagageDuJour[];
    }

    // Toutes les informations nécessaires pour réimprimer le reçu ou le talon
    // d'un bagage déjà enregistré.
    details(uuid: string): {
        uuid: string;
        numero_bagage: string;
        numero_ticket: string | null;
        numero_place: number | null;
        destination: string | null;
        voyage: string | null;
        client: string | null;
        client_telephone: string | null;
        description: string | null;
        valeur: number | null;
        montant: number;
        agence: string | null;
        agent: string | null;
        created_at: string;
    } | null {
        const ligne = getDb()
            .prepare(
                `SELECT b.uuid, b.numero_bagage, COALESCE(t.numero_ticket, b.ticket_numero) AS numero_ticket,
                        t.numero_place AS numero_place,
                        va.nom AS destination,
                        CASE WHEN vy.id IS NULL THEN NULL
                             ELSE vy.date_depart || ' à ' || substr(vy.heure_depart, 1, 5) END AS voyage,
                        COALESCE(NULLIF(TRIM(COALESCE(cb.prenoms, '') || ' ' || COALESCE(cb.nom, '')), ''),
                                 NULLIF(TRIM(COALESCE(cl.prenoms, '') || ' ' || COALESCE(cl.nom, '')), '')) AS client,
                        COALESCE(cb.telephone, cl.telephone) AS client_telephone,
                        b.description, b.valeur, b.montant,
                        ag.nom AS agence, u.name AS agent, b.created_at
                 FROM bagages b
                 LEFT JOIN tickets t ON t.id = b.ticket_id
                 LEFT JOIN clients cl ON cl.id = t.client_id
                 LEFT JOIN clients cb ON cb.id = b.client_id
                 LEFT JOIN villes va ON va.id = b.ville_arrivee_id
                 LEFT JOIN voyages vy ON vy.id = b.voyage_id
                 LEFT JOIN agences ag ON ag.id = b.agence_id
                 LEFT JOIN users u ON u.id = b.user_id
                 WHERE b.uuid = ?`,
            )
            .get(uuid) as never | undefined;

        return ligne ?? null;
    }

    rapportDuJour(agenceId: number, date?: string, voyageId?: number | null, userId?: number | null): {
        destinations: { destination_id: number | null; destination: string; nombre_bagages: number; montant_total: number; valeur_totale: number }[];
        nombre_bagages: number;
        montant_total: number;
        valeur_totale: number;
        avec_ticket: number;
        sans_ticket: number;
        agents: string[];
    } {
        const db = getDb();
        const ligne = db
            .prepare(
                `SELECT COUNT(*) AS nombre_bagages,
                        COALESCE(SUM(montant), 0) AS montant_total,
                        COALESCE(SUM(valeur), 0) AS valeur_totale,
                        COALESCE(SUM(CASE WHEN ticket_id IS NOT NULL OR ticket_numero IS NOT NULL THEN 1 ELSE 0 END), 0) AS avec_ticket,
                        COALESCE(SUM(CASE WHEN ticket_id IS NULL AND ticket_numero IS NULL THEN 1 ELSE 0 END), 0) AS sans_ticket
                 FROM bagages
                 WHERE agence_id = ? AND date(created_at) = date(?) AND statut_paiement = 'paye'
                   AND (? IS NULL OR voyage_id = ?)
                   AND (? IS NULL OR user_id = ?)`,
            )
            .get(agenceId, date ?? 'now', voyageId ?? null, voyageId ?? null, userId ?? null, userId ?? null) as { nombre_bagages: number; montant_total: number; valeur_totale: number; avec_ticket: number; sans_ticket: number };

        const destinations = db
            .prepare(
                `SELECT b.ville_arrivee_id AS destination_id,
                        COALESCE(v.nom, 'Non renseignée') AS destination,
                        COUNT(b.id) AS nombre_bagages,
                        COALESCE(SUM(b.montant), 0) AS montant_total,
                        COALESCE(SUM(b.valeur), 0) AS valeur_totale
                 FROM bagages b
                 LEFT JOIN villes v ON v.id = b.ville_arrivee_id
                 WHERE b.agence_id = ? AND date(b.created_at) = date(?) AND b.statut_paiement = 'paye'
                   AND (? IS NULL OR b.voyage_id = ?)
                   AND (? IS NULL OR b.user_id = ?)
                 GROUP BY b.ville_arrivee_id, v.nom
                 ORDER BY destination ASC`,
            )
            .all(agenceId, date ?? 'now', voyageId ?? null, voyageId ?? null, userId ?? null, userId ?? null) as { destination_id: number | null; destination: string; nombre_bagages: number; montant_total: number; valeur_totale: number }[];

        const agents = (db
            .prepare(
                `SELECT DISTINCT u.name AS nom
                 FROM bagages b
                 JOIN users u ON u.id = b.user_id
                 WHERE b.agence_id = ? AND date(b.created_at) = date(?) AND b.statut_paiement = 'paye'
                   AND (? IS NULL OR b.voyage_id = ?)
                   AND (? IS NULL OR b.user_id = ?)
                 ORDER BY u.name ASC`,
            )
            .all(agenceId, date ?? 'now', voyageId ?? null, voyageId ?? null, userId ?? null, userId ?? null) as { nom: string | null }[])
            .map((l) => l.nom)
            .filter((n): n is string => !!n);

        return { ...ligne, destinations, agents };
    }

    creer(donnees: NouveauBagage): { id: number; uuid: string; numero_bagage: string } {
        const db = getDb();
        const uuid = nouvelUuid();
        const numeroBagage = genererNumeroBagage(
            db,
            this.config.obtenir('licence_code_poste'),
            this.codeAgenceTicket(donnees.agenceId),
            donnees.numeroBagage,
        );
        const maintenant = donnees.createdAt || new Date().toISOString();

        const info = db
            .prepare(
                `INSERT INTO bagages (uuid, numero_bagage, agence_id, ticket_id, ticket_uuid, ticket_numero, ville_arrivee_id, agence_arrivee_id, voyage_id, voyage_uuid, client_id, user_id, agent_id, description, valeur, montant, statut_paiement, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'impression_en_attente', ?, ?)`,
            )
            .run(
                uuid,
                numeroBagage,
                donnees.agenceId,
                donnees.ticketId,
                donnees.ticketUuid,
                donnees.ticketNumero,
                donnees.villeArriveeId,
                null,
                donnees.voyageId,
                donnees.voyageUuid,
                donnees.clientId,
                donnees.userId,
                donnees.agentId,
                donnees.description,
                donnees.valeur,
                donnees.montant,
                maintenant,
                maintenant,
            );

        return { id: Number(info.lastInsertRowid), uuid, numero_bagage: numeroBagage };
    }

    confirmerImpression(uuid: string): boolean {
        const db = getDb();
        const maintenant = new Date().toISOString();

        return db.transaction(() => {
            const dejaValide = db
                .prepare(`SELECT 1 FROM bagages WHERE uuid = ? AND statut_paiement = 'paye' LIMIT 1`)
                .get(uuid);

            if (dejaValide) {
                return true;
            }

            const info = db
                .prepare(
                    `UPDATE bagages
                     SET statut_paiement = 'paye',
                         impression_confirmee_at = ?,
                         updated_at = ?
                     WHERE uuid = ? AND statut_paiement = 'impression_en_attente'`,
                )
                .run(maintenant, maintenant, uuid);

            if (info.changes === 0) {
                return false;
            }

            queueManager.ajouter('bagages', uuid, { uuid }, 'create');
            return true;
        })();
    }

    annulerImpression(uuid: string, motif: string): boolean {
        const maintenant = new Date().toISOString();
        const motifCourt = motif.trim().slice(0, 500) || 'Impression non confirmee';

        const info = getDb()
            .prepare(
                `UPDATE bagages
                 SET statut_paiement = 'annule',
                     annule_at = ?,
                     motif_annulation = ?,
                     updated_at = ?
                 WHERE uuid = ? AND statut_paiement = 'impression_en_attente'`,
            )
            .run(maintenant, motifCourt, maintenant, uuid);

        return info.changes > 0;
    }
}
