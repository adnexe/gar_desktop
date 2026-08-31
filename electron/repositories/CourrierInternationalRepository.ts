import { getDb } from '../database/connection';
import { nouvelUuid } from '../database/ids';
import { genererNumeroCourrierInternational, prevoirNumeroCourrierInternational } from '../database/numero';
import { queueManager } from '../sync/QueueManager';
import { ConfigRepository } from './ConfigRepository';
import { maintenantCaisseIso } from '../database/dates';

export interface LigneColisInternational {
    nom: string;
    type: string;
    quantite: number;
    poidsKg?: number | null;
    prix: number;
    frais?: number | null;
}

export interface NouveauCourrierInternational {
    agenceDepartId: number;
    paysDestinationId: number | null;
    villeDestinationId: number | null;
    expediteurId: number;
    destinataireId: number;
    userId: number;
    agentId: number | null;
    paysDestination: string;
    villeDestination: string;
    adresseDestination?: string | null;
    transporteur?: string | null;
    trackingExterne?: string | null;
    modeFacturation: 'par_kilo' | 'par_colis' | 'pourcentage';
    pourcentageFrais?: number | null;
    fraisExpedition: number;
    valeurColis: number;
    montantTotal: number;
    observation?: string | null;
    colis: LigneColisInternational[];
    numeroCourrier?: string | null;
}

export interface CourrierInternationalDuJour {
    uuid: string;
    numero_courrier: string;
    heure: string;
    destination: string;
    pays_destination: string;
    ville_destination: string;
    destinataire: string;
    destinataire_telephone?: string | null;
    expediteur?: string | null;
    expediteur_telephone?: string | null;
    montant_total: number;
    valeur_colis: number;
}

export class CourrierInternationalRepository {
    private readonly config = new ConfigRepository();

    private codeAgenceTicket(agenceId: number): string | null {
        const ligne = getDb()
            .prepare('SELECT code_ticket FROM agences WHERE id = ? LIMIT 1')
            .get(agenceId) as { code_ticket: string | null } | undefined;

        return ligne?.code_ticket ?? null;
    }

    prochainNumeroPrepare(agenceId: number): string | null {
        return prevoirNumeroCourrierInternational(getDb(), this.config.obtenir('licence_code_poste'), this.codeAgenceTicket(agenceId));
    }

    duJour(agenceId: number, date?: string, userId?: number | null): CourrierInternationalDuJour[] {
        return getDb()
            .prepare(
                `SELECT c.uuid, c.numero_courrier, time(c.created_at) AS heure,
                        (c.ville_destination || ', ' || c.pays_destination) AS destination,
                        c.pays_destination, c.ville_destination,
                        TRIM(COALESCE(cl.prenoms, '') || ' ' || COALESCE(cl.nom, '')) AS destinataire,
                        cl.telephone AS destinataire_telephone,
                        TRIM(COALESCE(ex.prenoms, '') || ' ' || COALESCE(ex.nom, '')) AS expediteur,
                        ex.telephone AS expediteur_telephone,
                        c.montant_total, c.valeur_colis
                 FROM courriers_internationaux c
                 JOIN clients cl ON cl.id = c.destinataire_id
                 JOIN clients ex ON ex.id = c.expediteur_id
                 WHERE c.agence_depart_id = ? AND date(c.created_at) = date(?)
                   AND c.statut = 'enregistre'
                   AND (? IS NULL OR c.user_id = ?)
                 ORDER BY c.created_at DESC`,
            )
            .all(agenceId, date ?? 'now', userId ?? null, userId ?? null) as CourrierInternationalDuJour[];
    }

    rapportDuJour(agenceId: number, date?: string, userId?: number | null) {
        const db = getDb();
        const ligne = db
            .prepare(
                `SELECT COUNT(*) AS nombre_courriers,
                        COALESCE(SUM(montant_total), 0) AS montant_total,
                        COALESCE(SUM(valeur_colis), 0) AS valeur_colis,
                        COALESCE((SELECT SUM(co.quantite) FROM colis_internationaux co
                                  WHERE co.courrier_international_id IN (
                                      SELECT id FROM courriers_internationaux
                                      WHERE agence_depart_id = ? AND date(created_at) = date(?) AND statut = 'enregistre'
                                        AND (? IS NULL OR user_id = ?)
                                  )), 0) AS nombre_colis
                 FROM courriers_internationaux
                 WHERE agence_depart_id = ? AND date(created_at) = date(?) AND statut = 'enregistre'
                   AND (? IS NULL OR user_id = ?)`,
            )
            .get(agenceId, date ?? 'now', userId ?? null, userId ?? null, agenceId, date ?? 'now', userId ?? null, userId ?? null) as {
                nombre_courriers: number;
                nombre_colis: number;
                montant_total: number;
                valeur_colis: number;
            };

        const destinations = db
            .prepare(
                `SELECT c.pays_destination || ' / ' || c.ville_destination AS destination,
                        COUNT(c.id) AS nombre_courriers,
                        COALESCE(SUM((SELECT SUM(co.quantite) FROM colis_internationaux co WHERE co.courrier_international_id = c.id)), 0) AS nombre_colis,
                        COALESCE(SUM(c.montant_total), 0) AS montant_total,
                        COALESCE(SUM(c.valeur_colis), 0) AS valeur_colis
                 FROM courriers_internationaux c
                 WHERE c.agence_depart_id = ? AND date(c.created_at) = date(?) AND c.statut = 'enregistre'
                   AND (? IS NULL OR c.user_id = ?)
                 GROUP BY c.pays_destination, c.ville_destination
                 ORDER BY destination ASC`,
            )
            .all(agenceId, date ?? 'now', userId ?? null, userId ?? null) as {
                destination: string;
                nombre_courriers: number;
                nombre_colis: number;
                montant_total: number;
                valeur_colis: number;
            }[];

        const agents = (db
            .prepare(
                `SELECT DISTINCT u.name AS nom
                 FROM courriers_internationaux c
                 JOIN users u ON u.id = c.user_id
                 WHERE c.agence_depart_id = ? AND date(c.created_at) = date(?) AND c.statut = 'enregistre'
                   AND (? IS NULL OR c.user_id = ?)
                 ORDER BY u.name ASC`,
            )
            .all(agenceId, date ?? 'now', userId ?? null, userId ?? null) as { nom: string | null }[])
            .map((l) => l.nom)
            .filter((n): n is string => !!n);

        return { ...ligne, destinations, agents };
    }

    details(uuid: string) {
        const db = getDb();
        const ligne = db
            .prepare(
                `SELECT c.id, c.uuid, c.numero_courrier,
                        c.pays_destination, c.ville_destination,
                        c.ville_destination || ', ' || c.pays_destination AS destination,
                        c.adresse_destination, c.transporteur, c.tracking_externe,
                        c.mode_facturation, c.pourcentage_frais,
                        TRIM(COALESCE(ex.prenoms, '') || ' ' || COALESCE(ex.nom, '')) AS expediteur_nom,
                        COALESCE(ex.telephone, '') AS expediteur_telephone,
                        TRIM(COALESCE(cl.prenoms, '') || ' ' || COALESCE(cl.nom, '')) AS destinataire_nom,
                        COALESCE(cl.telephone, '') AS destinataire_telephone,
                        c.frais_expedition AS prix_expedition,
                        c.valeur_colis AS montant_colis,
                        c.montant_total,
                        ad.nom AS agence_depart, ad.telephone AS agence_depart_telephone, u.name AS agent, c.created_at
                 FROM courriers_internationaux c
                 JOIN clients ex ON ex.id = c.expediteur_id
                 JOIN clients cl ON cl.id = c.destinataire_id
                 LEFT JOIN agences ad ON ad.id = c.agence_depart_id
                 LEFT JOIN users u ON u.id = c.user_id
                 WHERE c.uuid = ?`,
            )
            .get(uuid) as ({ id: number } & Record<string, unknown>) | undefined;

        if (!ligne) return null;

        const colis = db
            .prepare(
                `SELECT nom, type, quantite, poids_kg, prix, montant, frais_unitaire, frais_expedition
                 FROM colis_internationaux
                 WHERE courrier_international_id = ?
                 ORDER BY id ASC`,
            )
            .all(ligne.id) as Record<string, unknown>[];

        const { id: _id, ...reste } = ligne;
        return { ...reste, agence_arrivee: null, agence_arrivee_telephone: null, voyage: null, colis };
    }

    creer(donnees: NouveauCourrierInternational): { id: number; uuid: string; numeroCourrier: string; valeurColis: number; montantTotal: number; created_at: string } {
        const db = getDb();
        const uuid = nouvelUuid();
        const numeroCourrier = genererNumeroCourrierInternational(
            db,
            this.config.obtenir('licence_code_poste'),
            this.codeAgenceTicket(donnees.agenceDepartId),
            donnees.numeroCourrier,
        );
        const maintenant = maintenantCaisseIso();

        return db.transaction(() => {
            const info = db
                .prepare(
                    `INSERT INTO courriers_internationaux (uuid, numero_courrier, agence_depart_id, pays_destination_id, ville_destination_id, expediteur_id, destinataire_id, user_id, agent_id, pays_destination, ville_destination, adresse_destination, transporteur, tracking_externe, mode_facturation, pourcentage_frais, frais_expedition, valeur_colis, montant_total, statut, observation, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'impression_en_attente', ?, ?, ?)`,
                )
                .run(
                    uuid,
                    numeroCourrier,
                    donnees.agenceDepartId,
                    donnees.paysDestinationId,
                    donnees.villeDestinationId,
                    donnees.expediteurId,
                    donnees.destinataireId,
                    donnees.userId,
                    donnees.agentId,
                    donnees.paysDestination,
                    donnees.villeDestination,
                    donnees.adresseDestination ?? null,
                    donnees.transporteur ?? null,
                    donnees.trackingExterne ?? null,
                    donnees.modeFacturation,
                    donnees.pourcentageFrais ?? null,
                    donnees.fraisExpedition,
                    donnees.valeurColis,
                    donnees.montantTotal,
                    donnees.observation ?? null,
                    maintenant,
                    maintenant,
                );

            const courrierId = Number(info.lastInsertRowid);
            const colisStmt = db.prepare(
                `INSERT INTO colis_internationaux (uuid, courrier_international_id, nom, type, quantite, poids_kg, prix, montant, frais_unitaire, frais_expedition, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            );

            for (const ligne of donnees.colis) {
                const quantite = Number(ligne.quantite);
                const prix = Number(ligne.prix);
                const poids = ligne.poidsKg ?? null;
                const fraisUnitaire = donnees.modeFacturation === 'par_colis' ? (ligne.frais ?? 0) : donnees.modeFacturation === 'par_kilo' ? (ligne.frais ?? null) : null;
                const fraisLigne = donnees.modeFacturation === 'par_colis'
                    ? quantite * Number(ligne.frais ?? 0)
                    : donnees.modeFacturation === 'par_kilo'
                        ? quantite * Number(poids ?? 0) * Number(fraisUnitaire ?? 0)
                        : null;

                colisStmt.run(
                    nouvelUuid(),
                    courrierId,
                    ligne.nom,
                    ligne.type,
                    quantite,
                    poids,
                    prix,
                    quantite * prix,
                    fraisUnitaire,
                    fraisLigne,
                    maintenant,
                    maintenant,
                );
            }

            return { id: courrierId, uuid, numeroCourrier, valeurColis: donnees.valeurColis, montantTotal: donnees.montantTotal, created_at: maintenant };
        })();
    }

    confirmerImpression(uuid: string): boolean {
        const db = getDb();
        const maintenant = maintenantCaisseIso();

        return db.transaction(() => {
            const dejaValide = db
                .prepare(`SELECT 1 FROM courriers_internationaux WHERE uuid = ? AND statut != 'impression_en_attente' AND statut != 'annule' LIMIT 1`)
                .get(uuid);

            if (dejaValide) return true;

            const info = db
                .prepare(
                    `UPDATE courriers_internationaux
                     SET statut = 'enregistre',
                         impression_confirmee_at = ?,
                         updated_at = ?
                     WHERE uuid = ? AND statut = 'impression_en_attente'`,
                )
                .run(maintenant, maintenant, uuid);

            if (info.changes === 0) return false;

            queueManager.ajouter('courriers_internationaux', uuid, { uuid }, 'create');
            return true;
        })();
    }

    annulerImpression(uuid: string, motif: string): boolean {
        const maintenant = maintenantCaisseIso();
        const motifCourt = motif.trim().slice(0, 500) || 'Impression non confirmee';

        const info = getDb()
            .prepare(
                `UPDATE courriers_internationaux
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
