import { getDb } from '../database/connection';
import type { BootstrapResponse, UserApi } from '../types/bootstrap';

// Les tables de catalogue reprennent l'id auto-incrémenté du serveur tel
// quel (INSERT OR REPLACE sur la PK) : ce sont des données synchronisées en
// lecture seule, il n'y a donc pas de risque de collision avec des id créés
// localement (contrairement aux tables opérationnelles qui utilisent uuid).
export class CatalogueRepository {
    seed(bootstrap: BootstrapResponse): void {
        const db = getDb();

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

            const villeStmt = db.prepare(
                `INSERT OR REPLACE INTO villes (id, uuid, nom, actif, created_at, updated_at)
                 VALUES (@id, @uuid, @nom, @actif, @created_at, @updated_at)`,
            );
            for (const v of bootstrap.villes) {
                villeStmt.run({ ...v, actif: v.actif ? 1 : 0 });
            }

            const agenceStmt = db.prepare(
                `INSERT OR REPLACE INTO agences (id, uuid, reference, ville_id, nom, adresse, telephone, actif, created_at, updated_at)
                 VALUES (@id, @uuid, @reference, @ville_id, @nom, @adresse, @telephone, @actif, @created_at, @updated_at)`,
            );
            agenceStmt.run({ ...bootstrap.agence, actif: bootstrap.agence.actif ? 1 : 0 });

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
            })) {
                configStmt.run(cle, valeur ?? '');
            }

            const itineraireStmt = db.prepare(
                `INSERT OR REPLACE INTO itineraires (id, uuid, ville_depart_id, ville_arrivee_id, nom, actif, created_at, updated_at)
                 VALUES (@id, @uuid, @ville_depart_id, @ville_arrivee_id, @nom, @actif, @created_at, @updated_at)`,
            );
            const trajetStmt = db.prepare(
                `INSERT OR REPLACE INTO trajets (id, uuid, ville_depart_id, ville_arrivee_id, nom, actif, created_at, updated_at)
                 VALUES (@id, @uuid, @ville_depart_id, @ville_arrivee_id, @nom, @actif, @created_at, @updated_at)`,
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
                tarifStmt.run({ ...t, montant: Number(t.montant), actif: t.actif ? 1 : 0 });
            }

            const chauffeurStmt = db.prepare(
                `INSERT OR REPLACE INTO chauffeurs (id, uuid, agence_id, nom, telephone, numero_permis, statut, created_at, updated_at)
                 VALUES (@id, @uuid, @agence_id, @nom, @telephone, @numero_permis, @statut, @created_at, @updated_at)`,
            );
            for (const c of bootstrap.chauffeurs) chauffeurStmt.run(c);

            const vehiculeStmt = db.prepare(
                `INSERT OR REPLACE INTO vehicules (id, uuid, agence_id, immatriculation, marque, modele, nombre_places, statut, created_at, updated_at)
                 VALUES (@id, @uuid, @agence_id, @immatriculation, @marque, @modele, @nombre_places, @statut, @created_at, @updated_at)`,
            );
            for (const v of bootstrap.vehicules) vehiculeStmt.run(v);

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

            const agentStmt = db.prepare(
                `INSERT OR REPLACE INTO agents (id, uuid, agence_id, nom, telephone, role, type_agent, actif, created_at, updated_at)
                 VALUES (@id, @uuid, @agence_id, @nom, @telephone, @role, @type_agent, @actif, @created_at, @updated_at)`,
            );
            const userStmt = db.prepare(
                `INSERT OR REPLACE INTO users (id, uuid, agent_id, name, email, number, password, role, actif, created_at, updated_at)
                 VALUES (@id, @uuid, @agent_id, @name, @email, @number, @password, @role, @actif, @created_at, @updated_at)`,
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
