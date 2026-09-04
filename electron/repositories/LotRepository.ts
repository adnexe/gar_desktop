import { getDb } from '../database/connection';
import { nouvelUuid } from '../database/ids';
import { queueManager } from '../sync/QueueManager';
import { genererNumeroLot } from '../database/numero';
import { ConfigRepository } from './ConfigRepository';

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

export interface CreerLotDonnees {
    type: TypeLot;
    agenceId: number;
    date: string;
    userId: number;
    elementUuids: string[];
}

export interface RetirerElementsLotDonnees {
    uuid: string;
    userId: number;
    elementUuids: string[];
}

export interface DetailsLot extends LotResume {
    courriers: Record<string, unknown>[];
    bagages: Record<string, unknown>[];
}

export class LotRepository {
    private readonly config = new ConfigRepository();

    lister(agenceId: number, type: TypeLot, date: string, userIdFiltre: number | null): LotResume[] {
        const { tableLien, tableOperation, colonneOperation, colonneMontant } = this.definitionType(type);

        return getDb().prepare(
            `SELECT l.uuid, l.type, l.numero_lot, l.reference, l.date_operation,
                    l.destination, l.voyage_libelle, l.statut, l.created_at,
                    u.name AS cree_par,
                    COUNT(o.id) AS nombre_elements,
                    COALESCE(SUM(o.${colonneMontant}), 0) AS montant_total
             FROM lots_bordereaux l
             JOIN users u ON u.id = l.cree_par_user_id
             LEFT JOIN ${tableLien} lien ON lien.lot_id = l.id
             LEFT JOIN ${tableOperation} o ON o.id = lien.${colonneOperation}
             WHERE l.agence_id = ? AND l.type = ? AND date(l.date_operation) = date(?)
               AND (? IS NULL OR l.cree_par_user_id = ?)
             GROUP BY l.id
             ORDER BY l.numero_lot DESC`,
        ).all(agenceId, type, date, userIdFiltre, userIdFiltre) as LotResume[];
    }

    eligibles(agenceId: number, type: TypeLot, date: string, userIdFiltre: number | null): ElementLotEligible[] {
        if (type === 'courrier') return this.courriersEligibles(agenceId, date, userIdFiltre);
        if (type === 'courrier_international') return this.courriersInternationauxEligibles(agenceId, date, userIdFiltre);
        return this.bagagesEligibles(agenceId, date, userIdFiltre);
    }

    creer(donnees: CreerLotDonnees, userIdFiltre: number | null): LotResume {
        const db = getDb();
        const uuids = [...new Set(donnees.elementUuids.map((uuid) => uuid.trim()).filter(Boolean))];
        if (uuids.length === 0 || uuids.length > 250) throw new Error('SELECTION_LOT_INVALIDE');

        return db.transaction(() => {
            const elements = this.elementsPourCreation(donnees.agenceId, donnees.type, donnees.date, uuids, userIdFiltre);
            if (elements.length !== uuids.length) throw new Error('ELEMENT_LOT_INDISPONIBLE');

            const destinationIds = new Set(elements.map((element) => element.ville_destination_id ?? 'null'));
            const destinations = new Set(elements.map((element) => element.destination.trim().toLocaleLowerCase('fr')));
            const voyages = new Set(elements.map((element) => element.voyage_uuid ?? (element.voyage_id ? `id-${element.voyage_id}` : 'null')));
            if (destinationIds.size !== 1 || destinations.size !== 1 || voyages.size !== 1) throw new Error('LOT_DESTINATION_VOYAGE_UNIQUE');

            const numerotation = genererNumeroLot(
                db,
                donnees.type,
                this.config.obtenir('licence_code_poste'),
                this.codeAgenceTicket(donnees.agenceId),
            );
            const numeroLot = numerotation.numeroLot;
            const reference = numerotation.reference;
            const uuid = nouvelUuid();
            const maintenant = new Date().toISOString();
            const premier = elements[0];

            const insertion = db.prepare(
                `INSERT INTO lots_bordereaux
                    (uuid, type, agence_id, numero_lot, reference, date_operation,
                     ville_destination_id, destination, voyage_id, voyage_uuid, voyage_libelle,
                     statut, cree_par_user_id, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'en_preparation', ?, ?, ?)`,
            ).run(
                uuid,
                donnees.type,
                donnees.agenceId,
                numeroLot,
                reference,
                donnees.date,
                premier.ville_destination_id,
                premier.destination,
                premier.voyage_id,
                premier.voyage_uuid,
                premier.voyage,
                donnees.userId,
                maintenant,
                maintenant,
            );

            const lotId = Number(insertion.lastInsertRowid);
            const { tableLien, colonneOperation: colonne } = this.definitionType(donnees.type);
            const lier = db.prepare(`INSERT INTO ${tableLien} (lot_id, ${colonne}, created_at) VALUES (?, ?, ?)`);
            for (const element of elements) lier.run(lotId, element.id, maintenant);

            queueManager.ajouter('lots_bordereaux', uuid, {}, 'create');

            return this.resume(uuid);
        })();
    }

    details(uuid: string): DetailsLot | null {
        const lot = this.resumeOuNull(uuid);
        if (!lot) return null;

        const courriers = lot.type === 'courrier'
            ? this.detailsCourriers(uuid)
            : lot.type === 'courrier_international' ? this.detailsCourriersInternationaux(uuid) : [];
        const bagages = lot.type === 'bagage' ? this.detailsBagages(uuid) : [];
        return { ...lot, courriers, bagages };
    }

    changerStatut(uuid: string, statut: StatutLot): LotResume {
        const db = getDb();
        const actuel = this.resumeOuNull(uuid);
        if (!actuel) throw new Error('LOT_INTROUVABLE');

        const suivant: Record<StatutLot, StatutLot | null> = {
            en_preparation: 'expedie',
            expedie: 'arrive',
            arrive: 'livre',
            livre: null,
        };
        if (actuel.statut !== statut && suivant[actuel.statut] !== statut) throw new Error('TRANSITION_LOT_INVALIDE');
        if (actuel.statut === statut) return actuel;

        const maintenant = new Date().toISOString();
        const colonneDate = statut === 'expedie' ? 'expedie_at' : statut === 'arrive' ? 'arrive_at' : 'livre_at';
        db.prepare(`UPDATE lots_bordereaux SET statut = ?, ${colonneDate} = ?, updated_at = ? WHERE uuid = ?`)
            .run(statut, maintenant, maintenant, uuid);
        queueManager.ajouter('lots_bordereaux', uuid, {}, 'update');

        return this.resume(uuid);
    }

    retirerElements(uuid: string, elementUuids: string[]): DetailsLot {
        const db = getDb();
        const uuids = [...new Set(elementUuids.map((valeur) => valeur.trim()).filter(Boolean))];
        if (uuids.length === 0 || uuids.length > 249) throw new Error('SELECTION_RETRAIT_LOT_INVALIDE');

        return db.transaction(() => {
            const lot = db.prepare(
                'SELECT id, type, statut FROM lots_bordereaux WHERE uuid = ? LIMIT 1',
            ).get(uuid) as { id: number; type: TypeLot; statut: StatutLot } | undefined;
            if (!lot) throw new Error('LOT_INTROUVABLE');
            if (lot.statut !== 'en_preparation') throw new Error('LOT_DEJA_EXPEDIE_MODIFICATION_INTERDITE');

            const { tableLien, tableOperation, colonneOperation } = this.definitionType(lot.type);
            const placeholders = uuids.map(() => '?').join(',');
            const elements = db.prepare(
                `SELECT o.id
                 FROM ${tableLien} lien
                 JOIN ${tableOperation} o ON o.id = lien.${colonneOperation}
                 WHERE lien.lot_id = ? AND o.uuid IN (${placeholders})`,
            ).all(lot.id, ...uuids) as Array<{ id: number }>;
            if (elements.length !== uuids.length) throw new Error('ELEMENT_RETRAIT_LOT_INDISPONIBLE');

            const total = (db.prepare(
                `SELECT COUNT(*) AS nombre FROM ${tableLien} WHERE lot_id = ?`,
            ).get(lot.id) as { nombre: number }).nombre;
            if (total - elements.length < 1) throw new Error('LOT_DOIT_GARDER_UN_ELEMENT');

            const ids = elements.map((element) => element.id);
            const idsPlaceholders = ids.map(() => '?').join(',');
            db.prepare(
                `DELETE FROM ${tableLien} WHERE lot_id = ? AND ${colonneOperation} IN (${idsPlaceholders})`,
            ).run(lot.id, ...ids);

            db.prepare('UPDATE lots_bordereaux SET updated_at = ? WHERE id = ?')
                .run(new Date().toISOString(), lot.id);
            queueManager.ajouter('lots_bordereaux', uuid, {}, 'update');

            const details = this.details(uuid);
            if (!details) throw new Error('LOT_INTROUVABLE');
            return details;
        })();
    }

    contexte(uuid: string): { agence_id: number; type: TypeLot; cree_par_user_id: number } | null {
        const ligne = getDb().prepare('SELECT agence_id, type, cree_par_user_id FROM lots_bordereaux WHERE uuid = ? LIMIT 1')
            .get(uuid) as { agence_id: number; type: TypeLot; cree_par_user_id: number } | undefined;
        return ligne ?? null;
    }

    private courriersEligibles(agenceId: number, date: string, userIdFiltre: number | null): ElementLotEligible[] {
        return getDb().prepare(
            `SELECT c.uuid, c.numero_courrier AS numero, v.nom AS destination,
                    c.voyage_uuid,
                    CASE WHEN vy.id IS NULL THEN NULL ELSE vy.date_depart || ' à ' || substr(vy.heure_depart, 1, 5) END AS voyage,
                    v.nom || '|' || COALESCE(c.voyage_uuid, 'id-' || c.voyage_id, 'sans-voyage') AS groupe,
                    TRIM(COALESCE(cl.prenoms, '') || ' ' || COALESCE(cl.nom, '')) AS principal,
                    cl.telephone,
                    GROUP_CONCAT(co.quantite || ' x ' || co.nom, ', ') AS contenu,
                    c.montant_total AS montant
             FROM courriers c
             JOIN villes v ON v.id = c.ville_arrivee_id
             JOIN clients cl ON cl.id = c.destinataire_id
             LEFT JOIN voyages vy ON vy.id = c.voyage_id
             LEFT JOIN colis co ON co.courrier_id = c.id
             WHERE c.agence_depart_id = ? AND date(c.created_at) = date(?) AND c.statut = 'enregistre'
               AND (? IS NULL OR c.user_id = ?)
               AND NOT EXISTS (SELECT 1 FROM lot_courriers lc WHERE lc.courrier_id = c.id)
             GROUP BY c.id
             ORDER BY v.nom, voyage, c.created_at`,
        ).all(agenceId, date, userIdFiltre, userIdFiltre) as ElementLotEligible[];
    }

    private courriersInternationauxEligibles(agenceId: number, date: string, userIdFiltre: number | null): ElementLotEligible[] {
        return getDb().prepare(
            `SELECT c.uuid, c.numero_courrier AS numero,
                    c.ville_destination || ', ' || c.pays_destination AS destination,
                    NULL AS voyage_uuid, NULL AS voyage,
                    lower(trim(c.ville_destination)) || '|' || lower(trim(c.pays_destination)) AS groupe,
                    TRIM(COALESCE(cl.prenoms, '') || ' ' || COALESCE(cl.nom, '')) AS principal,
                    cl.telephone,
                    GROUP_CONCAT(co.quantite || ' x ' || co.nom, ', ') AS contenu,
                    c.montant_total AS montant
             FROM courriers_internationaux c
             JOIN clients cl ON cl.id = c.destinataire_id
             LEFT JOIN colis_internationaux co ON co.courrier_international_id = c.id
             WHERE c.agence_depart_id = ? AND date(c.created_at) = date(?) AND c.statut = 'enregistre'
               AND (? IS NULL OR c.user_id = ?)
               AND NOT EXISTS (
                   SELECT 1 FROM lot_courriers_internationaux lci
                   WHERE lci.courrier_international_id = c.id
               )
             GROUP BY c.id
             ORDER BY c.pays_destination, c.ville_destination, c.created_at`,
        ).all(agenceId, date, userIdFiltre, userIdFiltre) as ElementLotEligible[];
    }

    private bagagesEligibles(agenceId: number, date: string, userIdFiltre: number | null): ElementLotEligible[] {
        return getDb().prepare(
            `SELECT b.uuid, b.numero_bagage AS numero, COALESCE(v.nom, 'Non renseignée') AS destination,
                    b.voyage_uuid,
                    CASE WHEN vy.id IS NULL THEN NULL ELSE vy.date_depart || ' à ' || substr(vy.heure_depart, 1, 5) END AS voyage,
                    COALESCE(v.nom, 'Non renseignée') || '|' || COALESCE(b.voyage_uuid, 'id-' || b.voyage_id, 'sans-voyage') AS groupe,
                    COALESCE(NULLIF(TRIM(COALESCE(cb.prenoms, '') || ' ' || COALESCE(cb.nom, '')), ''),
                             NULLIF(TRIM(COALESCE(ct.prenoms, '') || ' ' || COALESCE(ct.nom, '')), ''), 'Client anonyme') AS principal,
                    COALESCE(cb.telephone, ct.telephone) AS telephone,
                    b.description AS contenu, b.montant
             FROM bagages b
             LEFT JOIN villes v ON v.id = b.ville_arrivee_id
             LEFT JOIN voyages vy ON vy.id = b.voyage_id
             LEFT JOIN clients cb ON cb.id = b.client_id
             LEFT JOIN tickets t ON t.id = b.ticket_id
             LEFT JOIN clients ct ON ct.id = t.client_id
             WHERE b.agence_id = ? AND date(b.created_at) = date(?) AND b.statut_paiement = 'paye'
               AND (? IS NULL OR b.user_id = ?)
               AND NOT EXISTS (SELECT 1 FROM lot_bagages lb WHERE lb.bagage_id = b.id)
             ORDER BY destination, voyage, b.created_at`,
        ).all(agenceId, date, userIdFiltre, userIdFiltre) as ElementLotEligible[];
    }

    private elementsPourCreation(agenceId: number, type: TypeLot, date: string, uuids: string[], userIdFiltre: number | null): {
        id: number;
        ville_destination_id: number | null;
        destination: string;
        voyage_id: number | null;
        voyage_uuid: string | null;
        voyage: string | null;
    }[] {
        const placeholders = uuids.map(() => '?').join(',');
        if (type === 'courrier') {
            return getDb().prepare(
                `SELECT c.id, c.ville_arrivee_id AS ville_destination_id, v.nom AS destination,
                        c.voyage_id, c.voyage_uuid,
                        CASE WHEN vy.id IS NULL THEN NULL ELSE vy.date_depart || ' à ' || substr(vy.heure_depart, 1, 5) END AS voyage
                 FROM courriers c
                 JOIN villes v ON v.id = c.ville_arrivee_id
                 LEFT JOIN voyages vy ON vy.id = c.voyage_id
                 WHERE c.agence_depart_id = ? AND date(c.created_at) = date(?) AND c.statut = 'enregistre'
                   AND (? IS NULL OR c.user_id = ?)
                   AND c.uuid IN (${placeholders})
                   AND NOT EXISTS (SELECT 1 FROM lot_courriers lc WHERE lc.courrier_id = c.id)`,
            ).all(agenceId, date, userIdFiltre, userIdFiltre, ...uuids) as never[];
        }

        if (type === 'courrier_international') {
            return getDb().prepare(
                `SELECT c.id, c.ville_destination_id AS ville_destination_id,
                        c.ville_destination || ', ' || c.pays_destination AS destination,
                        NULL AS voyage_id, NULL AS voyage_uuid, NULL AS voyage
                 FROM courriers_internationaux c
                 WHERE c.agence_depart_id = ? AND date(c.created_at) = date(?) AND c.statut = 'enregistre'
                   AND (? IS NULL OR c.user_id = ?)
                   AND c.uuid IN (${placeholders})
                   AND NOT EXISTS (
                       SELECT 1 FROM lot_courriers_internationaux lci
                       WHERE lci.courrier_international_id = c.id
                   )`,
            ).all(agenceId, date, userIdFiltre, userIdFiltre, ...uuids) as never[];
        }

        return getDb().prepare(
            `SELECT b.id, b.ville_arrivee_id AS ville_destination_id, COALESCE(v.nom, 'Non renseignée') AS destination,
                    b.voyage_id, b.voyage_uuid,
                    CASE WHEN vy.id IS NULL THEN NULL ELSE vy.date_depart || ' à ' || substr(vy.heure_depart, 1, 5) END AS voyage
             FROM bagages b
             LEFT JOIN villes v ON v.id = b.ville_arrivee_id
             LEFT JOIN voyages vy ON vy.id = b.voyage_id
             WHERE b.agence_id = ? AND date(b.created_at) = date(?) AND b.statut_paiement = 'paye'
               AND (? IS NULL OR b.user_id = ?)
               AND b.uuid IN (${placeholders})
               AND NOT EXISTS (SELECT 1 FROM lot_bagages lb WHERE lb.bagage_id = b.id)`,
        ).all(agenceId, date, userIdFiltre, userIdFiltre, ...uuids) as never[];
    }

    private detailsCourriers(lotUuid: string): Record<string, unknown>[] {
        const lignes = getDb().prepare(
            `SELECT c.uuid, c.numero_courrier, v.nom AS destination,
                    TRIM(COALESCE(ex.prenoms, '') || ' ' || COALESCE(ex.nom, '')) AS expediteur_nom,
                    COALESCE(ex.telephone, '') AS expediteur_telephone,
                    TRIM(COALESCE(dest.prenoms, '') || ' ' || COALESCE(dest.nom, '')) AS destinataire_nom,
                    COALESCE(dest.telephone, '') AS destinataire_telephone,
                    c.montant_total
             FROM lots_bordereaux l
             JOIN lot_courriers lc ON lc.lot_id = l.id
             JOIN courriers c ON c.id = lc.courrier_id
             JOIN villes v ON v.id = c.ville_arrivee_id
             JOIN clients ex ON ex.id = c.expediteur_id
             JOIN clients dest ON dest.id = c.destinataire_id
             WHERE l.uuid = ? ORDER BY c.created_at`,
        ).all(lotUuid) as (Record<string, unknown> & { uuid: string })[];

        const colis = getDb().prepare('SELECT nom, quantite FROM colis WHERE courrier_id = (SELECT id FROM courriers WHERE uuid = ?) ORDER BY id');
        return lignes.map((ligne) => ({ ...ligne, colis: colis.all(ligne.uuid) }));
    }

    private detailsCourriersInternationaux(lotUuid: string): Record<string, unknown>[] {
        const lignes = getDb().prepare(
            `SELECT c.uuid, c.numero_courrier,
                    c.ville_destination || ', ' || c.pays_destination AS destination,
                    TRIM(COALESCE(ex.prenoms, '') || ' ' || COALESCE(ex.nom, '')) AS expediteur_nom,
                    COALESCE(ex.telephone, '') AS expediteur_telephone,
                    TRIM(COALESCE(dest.prenoms, '') || ' ' || COALESCE(dest.nom, '')) AS destinataire_nom,
                    COALESCE(dest.telephone, '') AS destinataire_telephone,
                    c.montant_total
             FROM lots_bordereaux l
             JOIN lot_courriers_internationaux lci ON lci.lot_id = l.id
             JOIN courriers_internationaux c ON c.id = lci.courrier_international_id
             JOIN clients ex ON ex.id = c.expediteur_id
             JOIN clients dest ON dest.id = c.destinataire_id
             WHERE l.uuid = ? ORDER BY c.created_at`,
        ).all(lotUuid) as (Record<string, unknown> & { uuid: string })[];

        const colis = getDb().prepare(
            `SELECT nom, quantite FROM colis_internationaux
             WHERE courrier_international_id = (SELECT id FROM courriers_internationaux WHERE uuid = ?)
             ORDER BY id`,
        );
        return lignes.map((ligne) => ({ ...ligne, colis: colis.all(ligne.uuid) }));
    }

    private detailsBagages(lotUuid: string): Record<string, unknown>[] {
        return getDb().prepare(
            `SELECT b.uuid, b.numero_bagage, COALESCE(t.numero_ticket, b.ticket_numero) AS numero_ticket,
                    COALESCE(v.nom, 'Non renseignée') AS destination,
                    COALESCE(NULLIF(TRIM(COALESCE(cb.prenoms, '') || ' ' || COALESCE(cb.nom, '')), ''),
                             NULLIF(TRIM(COALESCE(ct.prenoms, '') || ' ' || COALESCE(ct.nom, '')), '')) AS client,
                    COALESCE(cb.telephone, ct.telephone) AS client_telephone,
                    b.description, b.valeur, b.montant
             FROM lots_bordereaux l
             JOIN lot_bagages lb ON lb.lot_id = l.id
             JOIN bagages b ON b.id = lb.bagage_id
             LEFT JOIN tickets t ON t.id = b.ticket_id
             LEFT JOIN clients ct ON ct.id = t.client_id
             LEFT JOIN clients cb ON cb.id = b.client_id
             LEFT JOIN villes v ON v.id = b.ville_arrivee_id
             WHERE l.uuid = ? ORDER BY b.created_at`,
        ).all(lotUuid) as Record<string, unknown>[];
    }

    private codeAgenceTicket(agenceId: number): string | null {
        const agence = getDb().prepare('SELECT code_ticket FROM agences WHERE id = ?').get(agenceId) as { code_ticket: string | null } | undefined;
        return agence?.code_ticket ?? null;
    }

    private definitionType(type: TypeLot): {
        tableLien: string;
        tableOperation: string;
        colonneOperation: string;
        colonneMontant: string;
    } {
        if (type === 'courrier') {
            return {
                tableLien: 'lot_courriers',
                tableOperation: 'courriers',
                colonneOperation: 'courrier_id',
                colonneMontant: 'montant_total',
            };
        }
        if (type === 'courrier_international') {
            return {
                tableLien: 'lot_courriers_internationaux',
                tableOperation: 'courriers_internationaux',
                colonneOperation: 'courrier_international_id',
                colonneMontant: 'montant_total',
            };
        }
        return {
            tableLien: 'lot_bagages',
            tableOperation: 'bagages',
            colonneOperation: 'bagage_id',
            colonneMontant: 'montant',
        };
    }

    private resume(uuid: string): LotResume {
        const lot = this.resumeOuNull(uuid);
        if (!lot) throw new Error('LOT_INTROUVABLE');
        return lot;
    }

    private resumeOuNull(uuid: string): LotResume | null {
        const base = getDb().prepare(
            `SELECT l.uuid, l.type, l.numero_lot, l.reference, l.date_operation,
                    l.destination, l.voyage_libelle, l.statut, l.created_at, u.name AS cree_par
             FROM lots_bordereaux l JOIN users u ON u.id = l.cree_par_user_id
             WHERE l.uuid = ? LIMIT 1`,
        ).get(uuid) as Omit<LotResume, 'nombre_elements' | 'montant_total'> | undefined;
        if (!base) return null;

        const { tableLien, tableOperation, colonneOperation, colonneMontant } = this.definitionType(base.type);
        const totaux = getDb().prepare(
            `SELECT COUNT(o.id) AS nombre_elements, COALESCE(SUM(o.${colonneMontant}), 0) AS montant_total
             FROM ${tableLien} lien JOIN ${tableOperation} o ON o.id = lien.${colonneOperation}
             WHERE lien.lot_id = (SELECT id FROM lots_bordereaux WHERE uuid = ?)`,
        ).get(uuid) as { nombre_elements: number; montant_total: number };

        return { ...base, ...totaux } as LotResume;
    }
}
