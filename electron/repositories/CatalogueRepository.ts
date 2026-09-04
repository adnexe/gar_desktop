import { getDb } from '../database/connection';
import { ConfigRepository } from './ConfigRepository';
import type { BootstrapResponse, UserApi } from '../types/bootstrap';

// Les tables de catalogue reprennent l'id auto-incrémenté du serveur tel
// quel (INSERT OR REPLACE sur la PK) : ce sont des données synchronisées en
// lecture seule, il n'y a donc pas de risque de collision avec des id créés
// localement (contrairement aux tables opérationnelles qui utilisent uuid).
export class CatalogueRepository {
    private readonly config = new ConfigRepository();

    seed(bootstrap: BootstrapResponse): void {
        const db = getDb();
        const importerVoyagesAdmin = this.config.obtenir('reseau_mode') !== 'client';

        db.transaction(() => {
            // Les REPLACE suppriment puis réinsèrent des lignes référencées
            // par les ventes locales (tickets → users/agents/voyages...) :
            // on reporte la vérification des FK à la fin de la transaction,
            // où tout est cohérent puisque les ids sont identiques.
            db.pragma('defer_foreign_keys = ON');

            // Un agent supprimé ou désactivé côté admin n'apparaît plus dans
            // la réponse : on désactive tout d'abord, le re-seed réactive
            // uniquement ceux que le serveur renvoie encore. Ses ventes
            // passées restent intactes (on ne supprime jamais la ligne).
            db.prepare('UPDATE agents SET actif = 0 WHERE agence_id = ?').run(bootstrap.agence.id);
            db.prepare('UPDATE users SET actif = 0').run();

            const paysStmt = db.prepare(
                `INSERT OR REPLACE INTO pays (id, uuid, nom, code, actif, created_at, updated_at)
                 VALUES (@id, @uuid, @nom, @code, @actif, @created_at, @updated_at)`,
            );
            for (const pays of bootstrap.pays ?? []) {
                paysStmt.run({ ...pays, actif: pays.actif ? 1 : 0 });
            }

            const villeStmt = db.prepare(
                `INSERT OR REPLACE INTO villes (id, uuid, nom, pays_id, actif, created_at, updated_at)
                 VALUES (@id, @uuid, @nom, @pays_id, @actif, @created_at, @updated_at)`,
            );
            for (const v of bootstrap.villes) {
                villeStmt.run({ ...v, pays_id: v.pays_id ?? null, actif: v.actif ? 1 : 0 });
            }

            const agenceStmt = db.prepare(
                `INSERT OR REPLACE INTO agences (id, uuid, reference, code_ticket, ville_id, nom, adresse, telephone, actif, created_at, updated_at)
                 VALUES (@id, @uuid, @reference, @code_ticket, @ville_id, @nom, @adresse, @telephone, @actif, @created_at, @updated_at)`,
            );
            db.prepare('UPDATE agences SET actif = 0').run();
            for (const agence of bootstrap.agences ?? [bootstrap.agence]) {
                agenceStmt.run({ ...agence, actif: agence.actif ? 1 : 0 });
            }

            const configStmt = db.prepare(
                `INSERT INTO config (cle, valeur) VALUES (?, ?)
                 ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur`,
            );
            const compagnie = bootstrap.compagnie;
            for (const [cle, valeur] of Object.entries({
                compagnie_nom: compagnie.nom,
                compagnie_slogan: compagnie.slogan,
                compagnie_telephone: compagnie.telephone,
                compagnie_whatsapp: compagnie.whatsapp,
                compagnie_email: compagnie.email,
                compagnie_site_web: compagnie.site_web,
                compagnie_adresse: compagnie.adresse,
                compagnie_pied_ticket: compagnie.pied_ticket,
                compagnie_logo_url: compagnie.logo_url,
                compagnie_logo_data_uri: compagnie.logo_data_uri,
                compagnie_modules_actifs: (compagnie.modules_actifs ?? []).join(','),
            })) {
                configStmt.run(cle, valeur ?? '');
            }

            // Surtout PAS « INSERT OR REPLACE » ici : REPLACE résout le conflit
            // de clé en SUPPRIMANT la ligne existante avant de réinsérer, ce qui
            // déclenche le ON DELETE CASCADE de itineraire_trajet et efface les
            // rattachements. Un même trajet appartenant à plusieurs itinéraires
            // était réécrit à chaque itinéraire de la boucle ci-dessous, effaçant
            // à chaque fois les liens créés pour les itinéraires précédents : au
            // final, seul le DERNIER itinéraire traité gardait ses trajets, et
            // les caisses affichaient « aucun voyage » pour tous les autres.
            // La mise à jour en place (ON CONFLICT DO UPDATE) ne supprime rien.
            const itineraireStmt = db.prepare(
                `INSERT INTO itineraires (id, uuid, ville_depart_id, ville_arrivee_id, nom, actif, created_at, updated_at)
                 VALUES (@id, @uuid, @ville_depart_id, @ville_arrivee_id, @nom, @actif, @created_at, @updated_at)
                 ON CONFLICT(id) DO UPDATE SET
                    uuid = excluded.uuid,
                    ville_depart_id = excluded.ville_depart_id,
                    ville_arrivee_id = excluded.ville_arrivee_id,
                    nom = excluded.nom,
                    actif = excluded.actif,
                    created_at = excluded.created_at,
                    updated_at = excluded.updated_at`,
            );
            const trajetStmt = db.prepare(
                `INSERT INTO trajets (id, uuid, ville_depart_id, ville_arrivee_id, nom, actif, created_at, updated_at)
                 VALUES (@id, @uuid, @ville_depart_id, @ville_arrivee_id, @nom, @actif, @created_at, @updated_at)
                 ON CONFLICT(id) DO UPDATE SET
                    uuid = excluded.uuid,
                    ville_depart_id = excluded.ville_depart_id,
                    ville_arrivee_id = excluded.ville_arrivee_id,
                    nom = excluded.nom,
                    actif = excluded.actif,
                    created_at = excluded.created_at,
                    updated_at = excluded.updated_at`,
            );
            const pivotStmt = db.prepare(
                `INSERT OR REPLACE INTO itineraire_trajet (itineraire_id, trajet_id, ordre_depart, ordre_arrivee, created_at, updated_at)
                 VALUES (@itineraire_id, @trajet_id, @ordre_depart, @ordre_arrivee, datetime('now'), datetime('now'))`,
            );
            for (const it of bootstrap.itineraires) {
                itineraireStmt.run({ ...it, actif: it.actif ? 1 : 0 });
                for (const t of it.trajets) {
                    trajetStmt.run({ ...t, actif: t.actif ? 1 : 0 });
                    pivotStmt.run({
                        itineraire_id: it.id,
                        trajet_id: t.id,
                        ordre_depart: t.pivot?.ordre_depart ?? 0,
                        ordre_arrivee: t.pivot?.ordre_arrivee ?? 0,
                    });
                }
            }

            const tarifStmt = db.prepare(
                `INSERT OR REPLACE INTO tarifs (id, uuid, agence_id, trajet_id, type_billet, tarification, montant, actif, created_at, updated_at)
                 VALUES (@id, @uuid, @agence_id, @trajet_id, @type_billet, @tarification, @montant, @actif, @created_at, @updated_at)`,
            );
            for (const t of bootstrap.tarifs) {
                // Un tarif peut référencer un trajet non rattaché à un
                // itinéraire actif (voire à aucun itinéraire) : la boucle
                // itinéraires ci-dessus ne l'aurait alors jamais inséré, et
                // ce tarif violerait la FK locale au commit — on l'insère
                // ici au besoin, depuis la relation chargée par le serveur.
                // Même instruction que plus haut : mise à jour en place, donc
                // sans cascade qui effacerait les rattachements du pivot.
                if (t.trajet) {
                    trajetStmt.run({ ...t.trajet, actif: t.trajet.actif ? 1 : 0 });
                }
                tarifStmt.run({ ...t, montant: Number(t.montant), actif: t.actif ? 1 : 0 });
            }

            const chauffeurStmt = db.prepare(
                `INSERT OR REPLACE INTO chauffeurs (id, uuid, agence_id, nom, telephone, numero_permis, statut, created_at, updated_at)
                 VALUES (@id, @uuid, @agence_id, @nom, @telephone, @numero_permis, @statut, @created_at, @updated_at)`,
            );
            for (const c of bootstrap.chauffeurs) chauffeurStmt.run(c);

            const vehiculeStmt = db.prepare(
                `INSERT OR REPLACE INTO vehicules (id, uuid, agence_id, immatriculation, marque, modele, nombre_places, disposition_sieges, statut, created_at, updated_at)
                 VALUES (@id, @uuid, @agence_id, @immatriculation, @marque, @modele, @nombre_places, @disposition_sieges, @statut, @created_at, @updated_at)`,
            );
            for (const v of bootstrap.vehicules) vehiculeStmt.run(v);

            if (importerVoyagesAdmin) {
                const voyageStmt = db.prepare(
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
                for (const v of bootstrap.voyages ?? []) voyageStmt.run(v);
            }

            const convoiStmt = db.prepare(
                `INSERT INTO convois
                    (uuid, reference, agence_id, ville_destination_id, precision_destination,
                     nombre_places, montant_fixe, date_depart, heure_depart, date_retour,
                     heure_retour, statut, cree_par_user_id, cree_par_nom, created_at, updated_at)
                 VALUES (@uuid, @reference, @agence_id, @ville_destination_id, @precision_destination,
                         @nombre_places, @montant_fixe, @date_depart, @heure_depart, @date_retour,
                         @heure_retour, @statut, @cree_par_user_id, @cree_par_nom, @created_at, @updated_at)
                 ON CONFLICT(uuid) DO UPDATE SET
                    reference = excluded.reference,
                    ville_destination_id = excluded.ville_destination_id,
                    precision_destination = excluded.precision_destination,
                    nombre_places = excluded.nombre_places,
                    montant_fixe = excluded.montant_fixe,
                    date_depart = excluded.date_depart,
                    heure_depart = excluded.heure_depart,
                    date_retour = excluded.date_retour,
                    heure_retour = excluded.heure_retour,
                    statut = excluded.statut,
                    cree_par_user_id = excluded.cree_par_user_id,
                    cree_par_nom = excluded.cree_par_nom,
                    updated_at = excluded.updated_at`,
            );
            for (const convoi of bootstrap.convois ?? []) convoiStmt.run(convoi);

            const agentStmt = db.prepare(
                `INSERT INTO agents (id, uuid, agence_id, nom, telephone, role, type_agent, actif, created_at, updated_at)
                 VALUES (@id, @uuid, @agence_id, @nom, @telephone, @role, @type_agent, @actif, @created_at, @updated_at)
                 ON CONFLICT(id) DO UPDATE SET
                    uuid = excluded.uuid,
                    agence_id = excluded.agence_id,
                    nom = excluded.nom,
                    telephone = excluded.telephone,
                    role = excluded.role,
                    type_agent = excluded.type_agent,
                    actif = excluded.actif,
                    created_at = excluded.created_at,
                    updated_at = excluded.updated_at`,
            );
            const userStmt = db.prepare(
                `INSERT INTO users (id, uuid, agent_id, name, email, number, password, role, actif, created_at, updated_at)
                 VALUES (@id, @uuid, @agent_id, @name, @email, @number, @password, @role, @actif, @created_at, @updated_at)
                 ON CONFLICT(id) DO UPDATE SET
                    uuid = excluded.uuid,
                    agent_id = excluded.agent_id,
                    name = excluded.name,
                    email = excluded.email,
                    number = excluded.number,
                    password = excluded.password,
                    role = excluded.role,
                    actif = CASE
                        WHEN COALESCE(users.desactive_localement, 0) = 1 OR COALESCE(users.supprime_localement, 0) = 1 THEN 0
                        ELSE excluded.actif
                    END,
                    created_at = excluded.created_at,
                    updated_at = excluded.updated_at`,
            );
            const userPayload = (u: UserApi) => ({
                ...u,
                // SQLite local garde number NOT NULL pour préserver les FK et
                // anciennes bases. Un super_admin email-only utilise son email
                // comme identifiant local de secours.
                number: u.number ?? u.email,
                actif: u.actif ? 1 : 0,
            });
            for (const a of bootstrap.agents) {
                agentStmt.run({ ...a, actif: a.actif ? 1 : 0 });
                if (a.user) {
                    userStmt.run(userPayload(a.user));
                }
            }

            for (const u of bootstrap.admin_users ?? []) {
                userStmt.run(userPayload({ ...u, agent_id: null }));
            }
        })();
    }
}
