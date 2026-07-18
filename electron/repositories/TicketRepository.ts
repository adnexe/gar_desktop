import { getDb } from '../database/connection';
import { nouvelUuid } from '../database/ids';
import { genererNumeroTicket, marquerNumeroTicketUtilise, prevoirNumeroTicket } from '../database/numero';
import { queueManager } from '../sync/QueueManager';
import { ConfigRepository } from './ConfigRepository';
import type { ClientServeur } from './ClientRepository';
import type { VoyageServeur } from './VoyageRepository';

export interface NouveauTicket {
    voyageId: number;
    agentId: number | null;
    userId: number;
    clientId: number | null;
    trajetId: number;
    typeBillet: string;
    numeroPlace: number;
    montant: number;
    timbre: number;
    tarification: string;
    numeroTicket?: string | null;
    createdAt?: string | null;
}

export interface TicketRow {
    id: number;
    uuid: string;
    numero_ticket: string;
    voyage_id: number;
    numero_place: number;
    montant: number;
    timbre: number;
    tarification: string;
    type_billet: string;
    client_id: number | null;
    statut_ticket: string;
    created_at: string;
}

export interface VenteDuJour {
    uuid: string;
    numero_ticket: string;
    heure: string;
    trajet: string;
    numero_place: number;
    client: string | null;
    montant: number;
    timbre: number;
    total: number;
}

export interface TicketServeur {
    uuid: string;
    numero_ticket: string;
    voyage_uuid: string;
    agent_id: number | null;
    user_id: number;
    client_uuid: string | null;
    trajet_id: number;
    type_billet: string;
    numero_place: number;
    montant: number;
    timbre: number;
    tarification: string;
    statut_paiement: string;
    statut_ticket: string;
    impression_confirmee_at: string | null;
    annule_at: string | null;
    motif_annulation: string | null;
    created_at: string | null;
    updated_at: string | null;
    client: ClientServeur | null;
    voyage: VoyageServeur | null;
}

export class TicketRepository {
    private readonly config = new ConfigRepository();

    private codeAgenceTicket(): string | null {
        const ligne = getDb()
            .prepare(
                `SELECT code_ticket
                 FROM agences
                 WHERE reference = (SELECT valeur FROM config WHERE cle = 'agence_reference')
                 LIMIT 1`,
            )
            .get() as { code_ticket: string | null } | undefined;

        return ligne?.code_ticket ?? null;
    }

    placeDejaVendue(voyageId: number, numeroPlace: number): boolean {
        const ligne = getDb()
            .prepare(
                `SELECT 1
                 FROM tickets
                 WHERE voyage_id = ? AND numero_place = ? AND statut_ticket <> 'annule'
                 LIMIT 1`,
            )
            .get(voyageId, numeroPlace);

        return ligne !== undefined;
    }

    prochainNumeroPrepare(): string | null {
        return prevoirNumeroTicket(getDb(), this.config.obtenir('licence_code_poste'), this.codeAgenceTicket());
    }

    marquerNumeroPrepareUtilise(numero: string | null | undefined): void {
        if (!numero) return;
        marquerNumeroTicketUtilise(getDb(), this.config.obtenir('licence_code_poste'), this.codeAgenceTicket(), numero);
    }

    creer(donnees: NouveauTicket): TicketRow {
        const db = getDb();

        return db.transaction(() => {
            if (this.placeDejaVendue(donnees.voyageId, donnees.numeroPlace)) {
                throw new Error('PLACE_DEJA_VENDUE');
            }

            const uuid = nouvelUuid();
            const numeroTicket = genererNumeroTicket(
                db,
                this.config.obtenir('licence_code_poste'),
                this.codeAgenceTicket(),
                donnees.numeroTicket,
            );
            const maintenant = donnees.createdAt || new Date().toISOString();

            const info = db
                .prepare(
                    `INSERT INTO tickets (uuid, numero_ticket, voyage_id, agent_id, user_id, client_id, trajet_id, type_billet, numero_place, montant, timbre, tarification, statut_paiement, statut_ticket, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'en_attente', 'impression_en_attente', ?, ?)`,
                )
                .run(
                    uuid,
                    numeroTicket,
                    donnees.voyageId,
                    donnees.agentId,
                    donnees.userId,
                    donnees.clientId,
                    donnees.trajetId,
                    donnees.typeBillet,
                    donnees.numeroPlace,
                    donnees.montant,
                    donnees.timbre,
                    donnees.tarification,
                    maintenant,
                    maintenant,
                );

            return {
                id: Number(info.lastInsertRowid),
                uuid,
                numero_ticket: numeroTicket,
                voyage_id: donnees.voyageId,
                numero_place: donnees.numeroPlace,
                montant: donnees.montant,
                timbre: donnees.timbre,
                tarification: donnees.tarification,
                type_billet: donnees.typeBillet,
                client_id: donnees.clientId,
                statut_ticket: 'impression_en_attente',
                created_at: maintenant,
            };
        })();
    }

    confirmerImpression(uuid: string): boolean {
        const db = getDb();
        const maintenant = new Date().toISOString();

        return db.transaction(() => {
            const dejaValide = db
                .prepare(`SELECT 1 FROM tickets WHERE uuid = ? AND statut_ticket = 'valide' LIMIT 1`)
                .get(uuid);

            if (dejaValide) {
                return true;
            }

            const info = db
                .prepare(
                    `UPDATE tickets
                     SET statut_ticket = 'valide',
                         statut_paiement = 'paye',
                         impression_confirmee_at = ?,
                         updated_at = ?
                     WHERE uuid = ? AND statut_ticket = 'impression_en_attente'`,
                )
                .run(maintenant, maintenant, uuid);

            if (info.changes === 0) {
                return false;
            }

            queueManager.ajouter('tickets', uuid, { uuid }, 'create');
            return true;
        })();
    }

    annulerImpression(uuid: string, motif: string): boolean {
        const maintenant = new Date().toISOString();
        const motifCourt = motif.trim().slice(0, 500) || 'Impression non confirmee';

        const info = getDb()
            .prepare(
                `UPDATE tickets
                 SET statut_ticket = 'annule',
                     statut_paiement = 'annule',
                     annule_at = ?,
                     motif_annulation = ?,
                     updated_at = ?
                 WHERE uuid = ? AND statut_ticket = 'impression_en_attente'`,
            )
            .run(maintenant, motifCourt, maintenant, uuid);

        return info.changes > 0;
    }

    avecDetails(ticketId: number) {
        return getDb()
            .prepare(
                `SELECT t.uuid, t.numero_ticket, t.numero_place, t.montant, t.timbre, t.tarification, t.type_billet, t.created_at,
                        (t.montant + t.timbre) AS total,
                        tr.nom AS trajet_nom, vd.nom AS ville_depart_nom, va.nom AS ville_arrivee_nom,
                        v.date_depart AS voyage_date, v.heure_depart AS voyage_heure, v.numero_depart,
                        veh.immatriculation AS vehicule_immatriculation,
                        a.nom AS agence_nom,
                        u.name AS vendeur_nom, u.number AS vendeur_number,
                        (c.prenoms || ' ' || c.nom) AS client_nom
                 FROM tickets t
                 JOIN trajets tr ON tr.id = t.trajet_id
                 JOIN villes vd ON vd.id = tr.ville_depart_id
                 JOIN villes va ON va.id = tr.ville_arrivee_id
                 JOIN voyages v ON v.id = t.voyage_id
                 JOIN vehicules veh ON veh.id = v.vehicule_id
                 JOIN agences a ON a.id = v.agence_depart_id
                 JOIN users u ON u.id = t.user_id
                 LEFT JOIN clients c ON c.id = t.client_id
                 WHERE t.id = ? AND t.statut_ticket <> 'annule'`,
            )
            .get(ticketId) as never;
    }

    parNumeroCourt(code: string): (TicketRow & {
        client_nom: string | null;
        client_prenoms: string | null;
        client_telephone: string | null;
        trajet_nom: string | null;
        date_depart: string;
        heure_depart: string;
        ville_depart_nom: string;
        ville_arrivee_id: number;
        ville_arrivee_nom: string;
        voyage_uuid: string;
    }) | null {
        const codeNettoye = code.trim().toUpperCase();

        // La ville d'arrivée du passager est celle du trajet qui n'est pas la
        // ville de l'agence de départ (les trajets sont bidirectionnels).
        const ligne = getDb()
            .prepare(
                `SELECT t.id, t.uuid, t.numero_ticket, t.voyage_id, t.numero_place, t.montant, t.timbre, t.tarification, t.type_billet, t.client_id, t.created_at,
                        c.nom AS client_nom, c.prenoms AS client_prenoms, c.telephone AS client_telephone,
                        tr.nom AS trajet_nom,
                        v.uuid AS voyage_uuid, v.date_depart, v.heure_depart,
                        vag.nom AS ville_depart_nom,
                        CASE WHEN tr.ville_depart_id = ag.ville_id THEN tr.ville_arrivee_id ELSE tr.ville_depart_id END AS ville_arrivee_id,
                        CASE WHEN tr.ville_depart_id = ag.ville_id THEN vva.nom ELSE vvd.nom END AS ville_arrivee_nom
                 FROM tickets t
                 LEFT JOIN clients c ON c.id = t.client_id
                 JOIN trajets tr ON tr.id = t.trajet_id
                 JOIN voyages v ON v.id = t.voyage_id
                 JOIN agences ag ON ag.id = v.agence_depart_id
                 JOIN villes vag ON vag.id = ag.ville_id
                 JOIN villes vvd ON vvd.id = tr.ville_depart_id
                 JOIN villes vva ON vva.id = tr.ville_arrivee_id
                 WHERE (t.numero_ticket = ? OR upper(substr(t.uuid, -8)) = ?)
                   AND t.statut_ticket = 'valide'
                 LIMIT 1`,
            )
            .get(codeNettoye, codeNettoye) as never;

        return ligne ?? null;
    }

    exporterUnPourClient(code: string): TicketServeur | null {
        const codeNettoye = code.trim().toUpperCase();
        const ligne = getDb()
            .prepare(
                `SELECT t.uuid, t.numero_ticket, v.uuid AS voyage_uuid, t.agent_id, t.user_id, c.uuid AS client_uuid,
                        t.trajet_id, t.type_billet, t.numero_place, t.montant, t.timbre, t.tarification,
                        t.statut_paiement, t.statut_ticket, t.impression_confirmee_at, t.annule_at, t.motif_annulation,
                        t.created_at, t.updated_at
                 FROM tickets t
                 JOIN voyages v ON v.id = t.voyage_id
                 LEFT JOIN clients c ON c.id = t.client_id
                 WHERE (t.numero_ticket = ? OR upper(substr(t.uuid, -8)) = ?)
                   AND t.statut_ticket = 'valide'
                 LIMIT 1`,
            )
            .get(codeNettoye, codeNettoye) as Omit<TicketServeur, 'client' | 'voyage'> | undefined;

        return ligne ? this.completerTicketServeur(ligne) : null;
    }

    exporterPourClient(agenceId: number, date?: string | null): TicketServeur[] {
        const dateRecherche = date?.trim();
        const filtreDate = dateRecherche
            ? 'AND date(v.date_depart) = date(@date)'
            : "AND date(v.date_depart) >= date('now')";

        const lignes = getDb()
            .prepare(
                `SELECT t.uuid, t.numero_ticket, v.uuid AS voyage_uuid, t.agent_id, t.user_id, c.uuid AS client_uuid,
                        t.trajet_id, t.type_billet, t.numero_place, t.montant, t.timbre, t.tarification,
                        t.statut_paiement, t.statut_ticket, t.impression_confirmee_at, t.annule_at, t.motif_annulation,
                        t.created_at, t.updated_at
                 FROM tickets t
                 JOIN voyages v ON v.id = t.voyage_id
                 LEFT JOIN clients c ON c.id = t.client_id
                 WHERE v.agence_depart_id = @agenceId
                   AND t.statut_ticket = 'valide'
                   ${filtreDate}
                 ORDER BY t.created_at DESC`,
            )
            .all({ agenceId, date: dateRecherche }) as Omit<TicketServeur, 'client' | 'voyage'>[];

        return lignes.map((ligne) => this.completerTicketServeur(ligne));
    }

    importerDepuisServeur(tickets: TicketServeur[]): number {
        if (!Array.isArray(tickets) || tickets.length === 0) return 0;

        const db = getDb();
        const maintenant = new Date().toISOString();
        const voyageStmt = db.prepare('SELECT id FROM voyages WHERE uuid = ? LIMIT 1');
        const clientStmt = db.prepare('SELECT id FROM clients WHERE uuid = ? LIMIT 1');
        const existantStmt = db.prepare('SELECT id FROM tickets WHERE uuid = ? OR numero_ticket = ? LIMIT 1');
        const insertStmt = db.prepare(
            `INSERT INTO tickets (uuid, numero_ticket, voyage_id, agent_id, user_id, client_id, trajet_id, type_billet, numero_place, montant, timbre, tarification, statut_paiement, statut_ticket, impression_confirmee_at, annule_at, motif_annulation, created_at, updated_at)
             VALUES (@uuid, @numero_ticket, @voyage_id, @agent_id, @user_id, @client_id, @trajet_id, @type_billet, @numero_place, @montant, @timbre, @tarification, @statut_paiement, @statut_ticket, @impression_confirmee_at, @annule_at, @motif_annulation, @created_at, @updated_at)`,
        );
        const updateStmt = db.prepare(
            `UPDATE tickets
             SET uuid = @uuid,
                 numero_ticket = @numero_ticket,
                 voyage_id = @voyage_id,
                 agent_id = @agent_id,
                 user_id = @user_id,
                 client_id = @client_id,
                 trajet_id = @trajet_id,
                 type_billet = @type_billet,
                 numero_place = @numero_place,
                 montant = @montant,
                 timbre = @timbre,
                 tarification = @tarification,
                 statut_paiement = @statut_paiement,
                 statut_ticket = @statut_ticket,
                 impression_confirmee_at = @impression_confirmee_at,
                 annule_at = @annule_at,
                 motif_annulation = @motif_annulation,
                 updated_at = @updated_at
             WHERE id = @id`,
        );

        return db.transaction(() => {
            let nombre = 0;
            for (const ticket of tickets) {
                const voyage = voyageStmt.get(ticket.voyage_uuid) as { id: number } | undefined;
                if (!voyage) {
                    continue;
                }

                const client = ticket.client_uuid ? clientStmt.get(ticket.client_uuid) as { id: number } | undefined : null;
                const payload = {
                    uuid: ticket.uuid,
                    numero_ticket: ticket.numero_ticket,
                    voyage_id: voyage.id,
                    agent_id: ticket.agent_id,
                    user_id: ticket.user_id,
                    client_id: client?.id ?? null,
                    trajet_id: ticket.trajet_id,
                    type_billet: ticket.type_billet,
                    numero_place: ticket.numero_place,
                    montant: Number(ticket.montant),
                    timbre: Number(ticket.timbre ?? 0),
                    tarification: ticket.tarification ?? 'ordinaire',
                    statut_paiement: ticket.statut_paiement ?? 'paye',
                    statut_ticket: ticket.statut_ticket ?? 'valide',
                    impression_confirmee_at: ticket.impression_confirmee_at ?? null,
                    annule_at: ticket.annule_at ?? null,
                    motif_annulation: ticket.motif_annulation ?? null,
                    created_at: ticket.created_at ?? maintenant,
                    updated_at: ticket.updated_at ?? maintenant,
                };
                const existant = existantStmt.get(payload.uuid, payload.numero_ticket) as { id: number } | undefined;
                if (existant) {
                    updateStmt.run({ ...payload, id: existant.id });
                } else {
                    insertStmt.run(payload);
                }
                nombre++;
            }

            return nombre;
        })();
    }

    private completerTicketServeur(ticket: Omit<TicketServeur, 'client' | 'voyage'>): TicketServeur {
        const db = getDb();
        const client = ticket.client_uuid
            ? db.prepare('SELECT uuid, nom, prenoms, telephone, cni, source, created_at, updated_at FROM clients WHERE uuid = ? LIMIT 1')
                .get(ticket.client_uuid) as ClientServeur | undefined
            : null;
        const voyage = db
            .prepare(
                `SELECT uuid, agence_depart_id, itineraire_id, vehicule_id, chauffeur_id,
                        date_depart, heure_depart, numero_depart, statut, created_at, updated_at
                 FROM voyages
                 WHERE uuid = ?
                 LIMIT 1`,
            )
            .get(ticket.voyage_uuid) as VoyageServeur | undefined;

        return { ...ticket, client: client ?? null, voyage: voyage ?? null };
    }

    ventesDuJour(agenceId: number, date?: string, userId?: number | null): VenteDuJour[] {
        return getDb()
            .prepare(
                `SELECT t.uuid, t.numero_ticket, time(t.created_at) AS heure, tr.nom AS trajet, t.numero_place,
                        (c.prenoms || ' ' || c.nom) AS client, c.telephone AS client_telephone,
                        t.montant, t.timbre, (t.montant + t.timbre) AS total
                 FROM tickets t
                 JOIN voyages v ON v.id = t.voyage_id
                 JOIN trajets tr ON tr.id = t.trajet_id
                 LEFT JOIN clients c ON c.id = t.client_id
                 WHERE v.agence_depart_id = ? AND date(t.created_at) = date(?)
                   AND t.statut_ticket = 'valide'
                   AND (? IS NULL OR t.user_id = ?)
                 ORDER BY t.created_at DESC`,
            )
            .all(agenceId, date ?? 'now', userId ?? null, userId ?? null) as VenteDuJour[];
    }

    // Rapport « fin de caisse » : nombre de tickets et montant encaissé par
    // trajet. Un même voyage peut contenir plusieurs trajets, donc grouper
    // seulement par voyage mélangerait les destinations dans une seule ligne.
    rapportParVoyage(agenceId: number, date?: string, userId?: number | null, voyageId?: number | null): {
        trajet_id: number;
        trajet: string;
        date_depart: string;
        heure_depart: string;
        numero_depart: number;
        nombre_tickets: number;
        montant_total: number;
    }[] {
        return getDb()
            .prepare(
                `SELECT t.trajet_id AS trajet_id,
                        tr.nom AS trajet,
                        MIN(v.date_depart) AS date_depart,
                        CASE
                            WHEN COUNT(DISTINCT v.id) = 1 THEN substr(MIN(v.heure_depart), 1, 5)
                            ELSE COUNT(DISTINCT v.id) || ' départs'
                        END AS heure_depart,
                        MIN(v.numero_depart) AS numero_depart,
                        COUNT(t.id) AS nombre_tickets,
                        COALESCE(SUM(t.montant + t.timbre), 0) AS montant_total
                 FROM tickets t
                 JOIN voyages v ON v.id = t.voyage_id
                 JOIN trajets tr ON tr.id = t.trajet_id
                 WHERE v.agence_depart_id = ? AND date(t.created_at) = date(?)
                   AND t.statut_ticket = 'valide'
                   AND (? IS NULL OR t.user_id = ?)
                   AND (? IS NULL OR t.voyage_id = ?)
                 GROUP BY t.trajet_id, tr.nom
                 ORDER BY MIN(v.heure_depart) ASC, tr.nom ASC`,
            )
            .all(agenceId, date ?? 'now', userId ?? null, userId ?? null, voyageId ?? null, voyageId ?? null) as never[];
    }

    // Liste des voyages ayant au moins un ticket valide sur la date, pour
    // proposer une fin de caisse ciblée sur un seul départ.
    voyagesAvecVentes(agenceId: number, date?: string, userId?: number | null): {
        voyage_id: number;
        itineraire: string;
        heure_depart: string;
        numero_depart: number;
        nombre_tickets: number;
    }[] {
        return getDb()
            .prepare(
                `SELECT v.id AS voyage_id,
                        i.nom AS itineraire,
                        substr(v.heure_depart, 1, 5) AS heure_depart,
                        v.numero_depart AS numero_depart,
                        COUNT(t.id) AS nombre_tickets
                 FROM tickets t
                 JOIN voyages v ON v.id = t.voyage_id
                 JOIN itineraires i ON i.id = v.itineraire_id
                 WHERE v.agence_depart_id = ? AND date(t.created_at) = date(?)
                   AND t.statut_ticket = 'valide'
                   AND (? IS NULL OR t.user_id = ?)
                 GROUP BY v.id, i.nom, v.heure_depart, v.numero_depart
                 ORDER BY v.heure_depart ASC, v.numero_depart ASC`,
            )
            .all(agenceId, date ?? 'now', userId ?? null, userId ?? null) as never[];
    }
}
