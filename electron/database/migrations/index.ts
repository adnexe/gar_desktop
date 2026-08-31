// Schéma SQLite local, mirroir des migrations Laravel (voir admin/database/migrations).
// Défini en TS (et non en fichiers .sql chargés à l'exécution) pour que le
// bundling electron-vite reste simple et fiable une fois l'app packagée.
export const migrations: { nom: string; sql: string }[] = [
    {
        nom: '0001_catalogue',
        sql: `
            CREATE TABLE IF NOT EXISTS villes (
                id INTEGER PRIMARY KEY,
                uuid TEXT NOT NULL UNIQUE,
                nom TEXT NOT NULL,
                actif INTEGER NOT NULL DEFAULT 1,
                created_at TEXT,
                updated_at TEXT
            );

            CREATE TABLE IF NOT EXISTS itineraires (
                id INTEGER PRIMARY KEY,
                uuid TEXT NOT NULL UNIQUE,
                ville_depart_id INTEGER NOT NULL REFERENCES villes(id),
                ville_arrivee_id INTEGER NOT NULL REFERENCES villes(id),
                nom TEXT,
                actif INTEGER NOT NULL DEFAULT 1,
                created_at TEXT,
                updated_at TEXT
            );

            CREATE TABLE IF NOT EXISTS trajets (
                id INTEGER PRIMARY KEY,
                uuid TEXT NOT NULL UNIQUE,
                ville_depart_id INTEGER NOT NULL REFERENCES villes(id),
                ville_arrivee_id INTEGER NOT NULL REFERENCES villes(id),
                nom TEXT,
                actif INTEGER NOT NULL DEFAULT 1,
                created_at TEXT,
                updated_at TEXT,
                UNIQUE (ville_depart_id, ville_arrivee_id)
            );

            CREATE TABLE IF NOT EXISTS itineraire_trajet (
                id INTEGER PRIMARY KEY,
                itineraire_id INTEGER NOT NULL REFERENCES itineraires(id) ON DELETE CASCADE,
                trajet_id INTEGER NOT NULL REFERENCES trajets(id) ON DELETE CASCADE,
                ordre_depart INTEGER NOT NULL,
                ordre_arrivee INTEGER NOT NULL,
                created_at TEXT,
                updated_at TEXT,
                UNIQUE (itineraire_id, trajet_id)
            );

            CREATE TABLE IF NOT EXISTS agences (
                id INTEGER PRIMARY KEY,
                uuid TEXT NOT NULL UNIQUE,
                reference TEXT NOT NULL UNIQUE,
                ville_id INTEGER NOT NULL REFERENCES villes(id),
                nom TEXT NOT NULL,
                adresse TEXT,
                telephone TEXT,
                actif INTEGER NOT NULL DEFAULT 1,
                created_at TEXT,
                updated_at TEXT
            );

            CREATE TABLE IF NOT EXISTS chauffeurs (
                id INTEGER PRIMARY KEY,
                uuid TEXT NOT NULL UNIQUE,
                agence_id INTEGER REFERENCES agences(id),
                nom TEXT NOT NULL,
                telephone TEXT,
                numero_permis TEXT UNIQUE,
                statut TEXT NOT NULL DEFAULT 'disponible',
                created_at TEXT,
                updated_at TEXT
            );

            CREATE TABLE IF NOT EXISTS vehicules (
                id INTEGER PRIMARY KEY,
                uuid TEXT NOT NULL UNIQUE,
                agence_id INTEGER REFERENCES agences(id),
                immatriculation TEXT NOT NULL UNIQUE,
                marque TEXT,
                modele TEXT,
                nombre_places INTEGER NOT NULL,
                statut TEXT NOT NULL DEFAULT 'disponible',
                created_at TEXT,
                updated_at TEXT
            );

            CREATE TABLE IF NOT EXISTS agents (
                id INTEGER PRIMARY KEY,
                uuid TEXT NOT NULL UNIQUE,
                agence_id INTEGER NOT NULL REFERENCES agences(id),
                nom TEXT NOT NULL,
                telephone TEXT,
                role TEXT NOT NULL DEFAULT 'caissiere',
                type_agent TEXT NOT NULL DEFAULT 'ticket',
                actif INTEGER NOT NULL DEFAULT 1,
                created_at TEXT,
                updated_at TEXT
            );

            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY,
                uuid TEXT NOT NULL UNIQUE,
                agent_id INTEGER REFERENCES agents(id),
                name TEXT,
                email TEXT,
                number TEXT NOT NULL UNIQUE,
                password TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'agent',
                actif INTEGER NOT NULL DEFAULT 1,
                created_at TEXT,
                updated_at TEXT
            );

            CREATE TABLE IF NOT EXISTS tarifs (
                id INTEGER PRIMARY KEY,
                uuid TEXT NOT NULL UNIQUE,
                agence_id INTEGER REFERENCES agences(id),
                trajet_id INTEGER REFERENCES trajets(id),
                type_billet TEXT NOT NULL,
                tarification TEXT NOT NULL DEFAULT 'ordinaire',
                montant REAL NOT NULL,
                actif INTEGER NOT NULL DEFAULT 1,
                created_at TEXT,
                updated_at TEXT,
                UNIQUE (agence_id, trajet_id, type_billet, tarification)
            );
        `,
    },
    {
        nom: '0002_operations',
        sql: `
            CREATE TABLE IF NOT EXISTS voyages (
                id INTEGER PRIMARY KEY,
                uuid TEXT NOT NULL UNIQUE,
                agence_depart_id INTEGER NOT NULL REFERENCES agences(id),
                itineraire_id INTEGER NOT NULL REFERENCES itineraires(id),
                vehicule_id INTEGER NOT NULL REFERENCES vehicules(id),
                chauffeur_id INTEGER REFERENCES chauffeurs(id),
                date_depart TEXT NOT NULL,
                heure_depart TEXT NOT NULL,
                numero_depart INTEGER NOT NULL DEFAULT 1,
                statut TEXT NOT NULL DEFAULT 'programme',
                created_at TEXT,
                updated_at TEXT
            );

            CREATE TABLE IF NOT EXISTS clients (
                id INTEGER PRIMARY KEY,
                uuid TEXT NOT NULL UNIQUE,
                nom TEXT,
                prenoms TEXT,
                telephone TEXT,
                cni TEXT,
                created_at TEXT,
                updated_at TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_clients_telephone ON clients(telephone);

            CREATE TABLE IF NOT EXISTS tickets (
                id INTEGER PRIMARY KEY,
                uuid TEXT NOT NULL UNIQUE,
                voyage_id INTEGER NOT NULL REFERENCES voyages(id),
                agent_id INTEGER REFERENCES agents(id),
                user_id INTEGER NOT NULL REFERENCES users(id),
                client_id INTEGER REFERENCES clients(id),
                trajet_id INTEGER NOT NULL REFERENCES trajets(id),
                type_billet TEXT NOT NULL,
                numero_place INTEGER NOT NULL,
                montant REAL NOT NULL,
                timbre REAL NOT NULL DEFAULT 0,
                tarification TEXT NOT NULL DEFAULT 'ordinaire',
                statut_paiement TEXT NOT NULL DEFAULT 'paye',
                statut_ticket TEXT NOT NULL DEFAULT 'valide',
                created_at TEXT,
                updated_at TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_tickets_voyage_place ON tickets(voyage_id, numero_place);

            CREATE TABLE IF NOT EXISTS bagages (
                id INTEGER PRIMARY KEY,
                uuid TEXT NOT NULL UNIQUE,
                ticket_id INTEGER NOT NULL REFERENCES tickets(id),
                user_id INTEGER NOT NULL REFERENCES users(id),
                description TEXT,
                montant REAL NOT NULL,
                statut_paiement TEXT NOT NULL DEFAULT 'paye',
                created_at TEXT,
                updated_at TEXT
            );

            CREATE TABLE IF NOT EXISTS courriers (
                id INTEGER PRIMARY KEY,
                uuid TEXT NOT NULL UNIQUE,
                agence_depart_id INTEGER NOT NULL REFERENCES agences(id),
                ville_arrivee_id INTEGER NOT NULL REFERENCES villes(id),
                expediteur_id INTEGER NOT NULL REFERENCES clients(id),
                destinataire_id INTEGER NOT NULL REFERENCES clients(id),
                user_id INTEGER NOT NULL REFERENCES users(id),
                prix_expedition REAL NOT NULL DEFAULT 0,
                montant_colis REAL NOT NULL DEFAULT 0,
                montant_total REAL NOT NULL DEFAULT 0,
                statut TEXT NOT NULL DEFAULT 'enregistre',
                created_at TEXT,
                updated_at TEXT
            );

            CREATE TABLE IF NOT EXISTS colis (
                id INTEGER PRIMARY KEY,
                uuid TEXT NOT NULL UNIQUE,
                courrier_id INTEGER NOT NULL REFERENCES courriers(id) ON DELETE CASCADE,
                nom TEXT NOT NULL,
                type TEXT NOT NULL,
                quantite INTEGER NOT NULL DEFAULT 1,
                prix REAL NOT NULL,
                montant REAL NOT NULL,
                created_at TEXT,
                updated_at TEXT
            );
        `,
    },
    {
        nom: '0003_local',
        sql: `
            CREATE TABLE IF NOT EXISTS config (
                cle TEXT PRIMARY KEY,
                valeur TEXT
            );

            CREATE TABLE IF NOT EXISTS sync_queue (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                entite TEXT NOT NULL,
                entite_uuid TEXT NOT NULL,
                operation TEXT NOT NULL DEFAULT 'create',
                payload TEXT NOT NULL,
                statut TEXT NOT NULL DEFAULT 'en_attente',
                tentatives INTEGER NOT NULL DEFAULT 0,
                derniere_erreur TEXT,
                created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
                synced_at TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_sync_queue_statut ON sync_queue(statut);
        `,
    },
    {
        nom: '0004_numeros_et_destinations',
        sql: `
            ALTER TABLE tickets ADD COLUMN numero_ticket TEXT;
            CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_numero_unique ON tickets(numero_ticket);

            ALTER TABLE courriers ADD COLUMN numero_courrier TEXT;
            ALTER TABLE courriers ADD COLUMN agence_arrivee_id INTEGER REFERENCES agences(id);
            ALTER TABLE courriers ADD COLUMN voyage_id INTEGER REFERENCES voyages(id);
            CREATE UNIQUE INDEX IF NOT EXISTS idx_courriers_numero_unique ON courriers(numero_courrier);

            -- ticket_id devient facultatif (un bagage peut être enregistré sans
            -- ticket, juste avec une destination/agence/voyage) : SQLite ne
            -- permet pas d'assouplir une contrainte NOT NULL par ALTER, on
            -- recrée donc la table.
            ALTER TABLE bagages RENAME TO bagages_old;
            CREATE TABLE bagages (
                id INTEGER PRIMARY KEY,
                uuid TEXT NOT NULL UNIQUE,
                numero_bagage TEXT,
                agence_id INTEGER REFERENCES agences(id),
                ticket_id INTEGER REFERENCES tickets(id),
                ville_arrivee_id INTEGER REFERENCES villes(id),
                agence_arrivee_id INTEGER REFERENCES agences(id),
                voyage_id INTEGER REFERENCES voyages(id),
                user_id INTEGER NOT NULL REFERENCES users(id),
                description TEXT,
                montant REAL NOT NULL,
                statut_paiement TEXT NOT NULL DEFAULT 'paye',
                created_at TEXT,
                updated_at TEXT
            );
            INSERT INTO bagages (id, uuid, agence_id, ticket_id, user_id, description, montant, statut_paiement, created_at, updated_at)
                SELECT b.id, b.uuid,
                       (SELECT v.agence_depart_id FROM tickets t JOIN voyages v ON v.id = t.voyage_id WHERE t.id = b.ticket_id),
                       b.ticket_id, b.user_id, b.description, b.montant, b.statut_paiement, b.created_at, b.updated_at
                FROM bagages_old b;
            DROP TABLE bagages_old;
            CREATE UNIQUE INDEX IF NOT EXISTS idx_bagages_numero_unique ON bagages(numero_bagage);
        `,
    },
    {
        nom: '0005_agent_sur_bagages_courriers',
        sql: `
            -- Chaque vente porte l'agent qui l'a réalisée (les tickets
            -- l'avaient déjà) : alignement bagages/courriers avec l'admin.
            ALTER TABLE bagages ADD COLUMN agent_id INTEGER REFERENCES agents(id);
            ALTER TABLE courriers ADD COLUMN agent_id INTEGER REFERENCES agents(id);
        `,
    },
    {
        nom: '0006_valeur_sur_bagages',
        sql: `
            -- Valeur déclarée du bagage (référence / assurance), distincte du
            -- montant à payer. Alignement avec l'admin.
            ALTER TABLE bagages ADD COLUMN valeur REAL;
        `,
    },
    {
        nom: '0007_trace_impression_tickets',
        sql: `
            -- Une vente ticket ne devient comptable qu'après acceptation de
            -- l'impression par le système. Les échecs sont conservés en audit.
            ALTER TABLE tickets ADD COLUMN impression_confirmee_at TEXT;
            ALTER TABLE tickets ADD COLUMN annule_at TEXT;
            ALTER TABLE tickets ADD COLUMN motif_annulation TEXT;
        `,
    },
    {
        nom: '0008_trace_impression_bagages_courriers',
        sql: `
            -- Même règle que les tickets : bagages et courriers ne deviennent
            -- comptables qu'après acceptation de l'impression par le système.
            ALTER TABLE bagages ADD COLUMN impression_confirmee_at TEXT;
            ALTER TABLE bagages ADD COLUMN annule_at TEXT;
            ALTER TABLE bagages ADD COLUMN motif_annulation TEXT;

            ALTER TABLE courriers ADD COLUMN impression_confirmee_at TEXT;
            ALTER TABLE courriers ADD COLUMN annule_at TEXT;
            ALTER TABLE courriers ADD COLUMN motif_annulation TEXT;
        `,
    },
    {
        nom: '0009_references_distantes_bagages_courriers',
        sql: `
            -- En mode poste client, les voyages peuvent venir de la caisse
            -- serveur. Les UUID distants restent utiles pour rattacher les
            -- opérations sans dépendre des IDs numériques locaux.
            ALTER TABLE bagages ADD COLUMN ticket_uuid TEXT;
            ALTER TABLE bagages ADD COLUMN ticket_numero TEXT;
            ALTER TABLE bagages ADD COLUMN voyage_uuid TEXT;
            ALTER TABLE courriers ADD COLUMN voyage_uuid TEXT;
        `,
    },
    {
        nom: '0010_source_clients',
        sql: `
            ALTER TABLE clients ADD COLUMN source TEXT NOT NULL DEFAULT 'ticket';
            UPDATE clients
               SET source = 'courrier'
             WHERE id IN (
                SELECT expediteur_id FROM courriers
                UNION
                SELECT destinataire_id FROM courriers
             )
               AND id NOT IN (
                SELECT client_id FROM tickets WHERE client_id IS NOT NULL
             );
            CREATE INDEX IF NOT EXISTS idx_clients_telephone_source ON clients(telephone, source);
        `,
    },
    {
        nom: '0011_statut_local_agents_users',
        sql: `
            -- Statuts locaux de sécurité : un chef de gare peut couper un accès
            -- même si le poste est hors-ligne. On ne supprime pas physiquement
            -- pour conserver les ventes passées liées aux users/agents.
            ALTER TABLE agents ADD COLUMN desactive_localement INTEGER NOT NULL DEFAULT 0;
            ALTER TABLE agents ADD COLUMN supprime_localement INTEGER NOT NULL DEFAULT 0;
            ALTER TABLE users ADD COLUMN desactive_localement INTEGER NOT NULL DEFAULT 0;
            ALTER TABLE users ADD COLUMN supprime_localement INTEGER NOT NULL DEFAULT 0;
        `,
    },
    {
        nom: '0012_agent_reste_trace_vente',
        sql: `
            -- L'agent est la trace métier des ventes. Seul le user gère
            -- l'accès à l'application; on annule donc d'éventuelles anciennes
            -- suppressions/désactivations locales posées sur agents.
            UPDATE agents
               SET desactive_localement = 0,
                   supprime_localement = 0
             WHERE COALESCE(desactive_localement, 0) = 1
                OR COALESCE(supprime_localement, 0) = 1;
        `,
    },
    {
        nom: '0013_code_ticket_agences',
        sql: `
            ALTER TABLE agences ADD COLUMN code_ticket TEXT;
        `,
    },
    {
        nom: '0014_client_sur_bagages',
        sql: `
            -- Un bagage sans ticket peut quand même porter un client (nom /
            -- téléphone saisis au comptoir), comme les courriers.
            ALTER TABLE bagages ADD COLUMN client_id INTEGER REFERENCES clients(id);
        `,
    },
    {
        nom: '0015_disposition_sieges_vehicules',
        sql: `
            -- "3-2" (3 sièges à gauche de l'allée, 2 à droite) ou "2-2".
            -- Nullable : sans valeur, le plan de sièges reste générique.
            ALTER TABLE vehicules ADD COLUMN disposition_sieges TEXT;
        `,
    },
    {
        nom: '0016_commission_sur_tickets',
        sql: `
            -- Commission due à un courtier ayant envoyé le client, saisie
            -- manuellement par la caissière après la vente. Ne fait pas
            -- partie du total encaissé auprès du client (timbre + montant) :
            -- elle est déduite côté gare, pas payée par le passager.
            ALTER TABLE tickets ADD COLUMN commission REAL NOT NULL DEFAULT 0;
        `,
    },
    {
        nom: '0017_courriers_internationaux',
        sql: `
            CREATE TABLE IF NOT EXISTS pays (
                id INTEGER PRIMARY KEY,
                uuid TEXT NOT NULL UNIQUE,
                nom TEXT NOT NULL,
                code TEXT NOT NULL UNIQUE,
                actif INTEGER NOT NULL DEFAULT 0,
                created_at TEXT,
                updated_at TEXT
            );

            ALTER TABLE villes ADD COLUMN pays_id INTEGER REFERENCES pays(id);
            CREATE INDEX IF NOT EXISTS idx_villes_pays_id ON villes(pays_id);

            CREATE TABLE IF NOT EXISTS courriers_internationaux (
                id INTEGER PRIMARY KEY,
                uuid TEXT NOT NULL UNIQUE,
                numero_courrier TEXT NOT NULL UNIQUE,
                agence_depart_id INTEGER NOT NULL REFERENCES agences(id),
                pays_destination_id INTEGER REFERENCES pays(id),
                ville_destination_id INTEGER REFERENCES villes(id),
                expediteur_id INTEGER NOT NULL REFERENCES clients(id),
                destinataire_id INTEGER NOT NULL REFERENCES clients(id),
                user_id INTEGER NOT NULL REFERENCES users(id),
                agent_id INTEGER REFERENCES agents(id),
                pays_destination TEXT NOT NULL,
                ville_destination TEXT NOT NULL,
                adresse_destination TEXT,
                transporteur TEXT,
                tracking_externe TEXT,
                mode_facturation TEXT NOT NULL DEFAULT 'par_colis',
                pourcentage_frais REAL,
                frais_expedition REAL NOT NULL DEFAULT 0,
                valeur_colis REAL NOT NULL DEFAULT 0,
                montant_total REAL NOT NULL DEFAULT 0,
                statut TEXT NOT NULL DEFAULT 'enregistre',
                observation TEXT,
                impression_confirmee_at TEXT,
                annule_at TEXT,
                motif_annulation TEXT,
                created_at TEXT,
                updated_at TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_courriers_internationaux_agence_date ON courriers_internationaux(agence_depart_id, created_at);

            CREATE TABLE IF NOT EXISTS colis_internationaux (
                id INTEGER PRIMARY KEY,
                uuid TEXT NOT NULL UNIQUE,
                courrier_international_id INTEGER NOT NULL REFERENCES courriers_internationaux(id) ON DELETE CASCADE,
                nom TEXT NOT NULL,
                type TEXT NOT NULL,
                quantite INTEGER NOT NULL DEFAULT 1,
                poids_kg REAL,
                prix REAL NOT NULL,
                montant REAL NOT NULL,
                frais_unitaire REAL,
                frais_expedition REAL,
                created_at TEXT,
                updated_at TEXT
            );
        `,
    },
    {
        nom: '0018_lots_bordereaux_locaux',
        sql: `
            CREATE TABLE IF NOT EXISTS lots_bordereaux (
                id INTEGER PRIMARY KEY,
                uuid TEXT NOT NULL UNIQUE,
                type TEXT NOT NULL CHECK(type IN ('courrier', 'bagage')),
                agence_id INTEGER NOT NULL REFERENCES agences(id),
                numero_lot INTEGER NOT NULL,
                reference TEXT NOT NULL UNIQUE,
                date_operation TEXT NOT NULL,
                ville_destination_id INTEGER REFERENCES villes(id),
                destination TEXT NOT NULL,
                voyage_id INTEGER REFERENCES voyages(id),
                voyage_uuid TEXT,
                voyage_libelle TEXT,
                statut TEXT NOT NULL DEFAULT 'en_preparation'
                    CHECK(statut IN ('en_preparation', 'expedie', 'arrive', 'livre')),
                cree_par_user_id INTEGER NOT NULL REFERENCES users(id),
                expedie_at TEXT,
                arrive_at TEXT,
                livre_at TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                UNIQUE(agence_id, type, numero_lot)
            );
            CREATE INDEX IF NOT EXISTS idx_lots_bordereaux_agence_type_date
                ON lots_bordereaux(agence_id, type, date_operation);

            CREATE TABLE IF NOT EXISTS lot_courriers (
                lot_id INTEGER NOT NULL REFERENCES lots_bordereaux(id) ON DELETE CASCADE,
                courrier_id INTEGER NOT NULL UNIQUE REFERENCES courriers(id),
                created_at TEXT NOT NULL,
                PRIMARY KEY(lot_id, courrier_id)
            );

            CREATE TABLE IF NOT EXISTS lot_bagages (
                lot_id INTEGER NOT NULL REFERENCES lots_bordereaux(id) ON DELETE CASCADE,
                bagage_id INTEGER NOT NULL UNIQUE REFERENCES bagages(id),
                created_at TEXT NOT NULL,
                PRIMARY KEY(lot_id, bagage_id)
            );
        `,
    },
    {
        nom: '0019_lots_courriers_internationaux',
        sql: `
            ALTER TABLE lot_courriers RENAME TO lot_courriers_0018;
            ALTER TABLE lot_bagages RENAME TO lot_bagages_0018;
            ALTER TABLE lots_bordereaux RENAME TO lots_bordereaux_0018;

            CREATE TABLE lots_bordereaux (
                id INTEGER PRIMARY KEY,
                uuid TEXT NOT NULL UNIQUE,
                type TEXT NOT NULL CHECK(type IN ('courrier', 'bagage', 'courrier_international')),
                agence_id INTEGER NOT NULL REFERENCES agences(id),
                numero_lot INTEGER NOT NULL,
                reference TEXT NOT NULL UNIQUE,
                date_operation TEXT NOT NULL,
                ville_destination_id INTEGER REFERENCES villes(id),
                destination TEXT NOT NULL,
                voyage_id INTEGER REFERENCES voyages(id),
                voyage_uuid TEXT,
                voyage_libelle TEXT,
                statut TEXT NOT NULL DEFAULT 'en_preparation'
                    CHECK(statut IN ('en_preparation', 'expedie', 'arrive', 'livre')),
                cree_par_user_id INTEGER NOT NULL REFERENCES users(id),
                expedie_at TEXT,
                arrive_at TEXT,
                livre_at TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                UNIQUE(agence_id, type, numero_lot)
            );

            INSERT INTO lots_bordereaux
                (id, uuid, type, agence_id, numero_lot, reference, date_operation,
                 ville_destination_id, destination, voyage_id, voyage_uuid, voyage_libelle,
                 statut, cree_par_user_id, expedie_at, arrive_at, livre_at, created_at, updated_at)
            SELECT id, uuid, type, agence_id, numero_lot, reference, date_operation,
                   ville_destination_id, destination, voyage_id, voyage_uuid, voyage_libelle,
                   statut, cree_par_user_id, expedie_at, arrive_at, livre_at, created_at, updated_at
            FROM lots_bordereaux_0018;

            CREATE TABLE lot_courriers (
                lot_id INTEGER NOT NULL REFERENCES lots_bordereaux(id) ON DELETE CASCADE,
                courrier_id INTEGER NOT NULL UNIQUE REFERENCES courriers(id),
                created_at TEXT NOT NULL,
                PRIMARY KEY(lot_id, courrier_id)
            );
            INSERT INTO lot_courriers (lot_id, courrier_id, created_at)
            SELECT lot_id, courrier_id, created_at FROM lot_courriers_0018;

            CREATE TABLE lot_bagages (
                lot_id INTEGER NOT NULL REFERENCES lots_bordereaux(id) ON DELETE CASCADE,
                bagage_id INTEGER NOT NULL UNIQUE REFERENCES bagages(id),
                created_at TEXT NOT NULL,
                PRIMARY KEY(lot_id, bagage_id)
            );
            INSERT INTO lot_bagages (lot_id, bagage_id, created_at)
            SELECT lot_id, bagage_id, created_at FROM lot_bagages_0018;

            CREATE TABLE lot_courriers_internationaux (
                lot_id INTEGER NOT NULL REFERENCES lots_bordereaux(id) ON DELETE CASCADE,
                courrier_international_id INTEGER NOT NULL UNIQUE REFERENCES courriers_internationaux(id),
                created_at TEXT NOT NULL,
                PRIMARY KEY(lot_id, courrier_international_id)
            );

            DROP TABLE lot_courriers_0018;
            DROP TABLE lot_bagages_0018;
            DROP TABLE lots_bordereaux_0018;

            CREATE INDEX idx_lots_bordereaux_agence_type_date
                ON lots_bordereaux(agence_id, type, date_operation);
        `,
    },
    {
        nom: '0020_synchroniser_lots_bordereaux',
        sql: `
            INSERT INTO sync_queue (entite, entite_uuid, operation, payload)
            SELECT 'lots_bordereaux', l.uuid, 'create', '{}'
            FROM lots_bordereaux l
            WHERE NOT EXISTS (
                SELECT 1 FROM sync_queue q
                WHERE q.entite = 'lots_bordereaux' AND q.entite_uuid = l.uuid
            );
        `,
    },
    {
        nom: '0021_suivi_postes',
        sql: `
            CREATE TABLE suivi_poste_periodes (
                uuid TEXT PRIMARY KEY,
                installation_uuid TEXT NOT NULL,
                agence_id INTEGER NOT NULL,
                payload TEXT NOT NULL,
                revision INTEGER NOT NULL,
                revision_synchro INTEGER NOT NULL DEFAULT 0,
                fermee INTEGER NOT NULL DEFAULT 0
            );
            CREATE INDEX idx_suivi_poste_envoi ON suivi_poste_periodes(installation_uuid, agence_id, revision_synchro);
        `,
    },
    {
        nom: '0022_trace_recuperation_admin',
        sql: `
            ALTER TABLE tickets ADD COLUMN recupere_admin_at TEXT;
            ALTER TABLE bagages ADD COLUMN recupere_admin_at TEXT;
            ALTER TABLE courriers ADD COLUMN recupere_admin_at TEXT;
            ALTER TABLE courriers_internationaux ADD COLUMN recupere_admin_at TEXT;
            ALTER TABLE lots_bordereaux ADD COLUMN recupere_admin_at TEXT;
        `,
    },
];
