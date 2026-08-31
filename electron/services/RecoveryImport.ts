import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

export type RecoverySection = 'ticket' | 'bagage' | 'courrier' | 'courrier_international';
type Row = Record<string, string | number | null>;
export type RecoverySnapshot = {
    version: number; agence_id: number; agence_uuid: string; section: RecoverySection; date: string;
    ventes_selectionnees: number; tables: Record<string, Row[]>; liens_lots: Row[]; liaisons_itineraires: Row[];
    numerotation: Record<string, { prefixe: string; numero: string }[]>;
};

const refs: Record<string, Record<string, string>> = {
    pays: {}, villes: { pays_id: 'pays' }, agences: { ville_id: 'villes' },
    agents: { agence_id: 'agences' }, users: { agent_id: 'agents' },
    chauffeurs: { agence_id: 'agences' }, vehicules: { agence_id: 'agences' },
    itineraires: { ville_depart_id: 'villes', ville_arrivee_id: 'villes' },
    trajets: { ville_depart_id: 'villes', ville_arrivee_id: 'villes' },
    clients: {},
    voyages: { agence_depart_id: 'agences', itineraire_id: 'itineraires', vehicule_id: 'vehicules', chauffeur_id: 'chauffeurs' },
    tickets: { voyage_id: 'voyages', agent_id: 'agents', user_id: 'users', client_id: 'clients', trajet_id: 'trajets' },
    bagages: { agence_id: 'agences', ticket_id: 'tickets', ville_arrivee_id: 'villes', agence_arrivee_id: 'agences', voyage_id: 'voyages', agent_id: 'agents', user_id: 'users', client_id: 'clients' },
    courriers: { agence_depart_id: 'agences', ville_arrivee_id: 'villes', agence_arrivee_id: 'agences', voyage_id: 'voyages', expediteur_id: 'clients', destinataire_id: 'clients', agent_id: 'agents', user_id: 'users' },
    courriers_internationaux: { agence_depart_id: 'agences', pays_destination_id: 'pays', ville_destination_id: 'villes', expediteur_id: 'clients', destinataire_id: 'clients', agent_id: 'agents', user_id: 'users' },
    colis: { courrier_id: 'courriers' }, colis_internationaux: { courrier_international_id: 'courriers_internationaux' },
    lots_bordereaux: { agence_id: 'agences', ville_destination_id: 'villes', voyage_id: 'voyages', cree_par_user_id: 'users' },
};
const catalogue = new Set(['pays', 'villes', 'agences', 'agents', 'users', 'chauffeurs', 'vehicules', 'itineraires', 'trajets']);
const sales: Record<RecoverySection, string> = { ticket: 'tickets', bagage: 'bagages', courrier: 'courriers', courrier_international: 'courriers_internationaux' };
const numbers: Record<string, string> = { tickets: 'numero_ticket', bagages: 'numero_bagage', courriers: 'numero_courrier', courriers_internationaux: 'numero_courrier', lots_bordereaux: 'reference' };
const sequences: Record<string, string> = { tickets: 'ticket_sequence', bagages: 'bagage_sequence', courriers: 'courrier_sequence', courriers_internationaux: 'courrier_international_sequence' };

export function importerRecuperation(db: Database.Database, snapshot: RecoverySnapshot, agence: { id: number; uuid: string }) {
    if (snapshot.version !== 1 || snapshot.agence_id !== agence.id || snapshot.agence_uuid !== agence.uuid || !sales[snapshot.section]) {
        throw new Error('La sauvegarde ne correspond pas à ce poste. Aucune donnée récupérée.');
    }
    const maintenant = new Date().toISOString();
    return db.transaction(() => {
        const ids: Record<string, Map<number, number>> = {};
        const ajoutes: Record<string, number> = {};
        const existants: Record<string, number> = {};
        const nouveauxLots = new Set<number>();
        const nouveauxParents = new Set<string>();
        const colonneLocales = (table: string) => new Set((db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(c => c.name));
        const pending = db.prepare("SELECT 1 FROM sync_queue WHERE entite = ? AND entite_uuid = ? AND statut != 'synchronise' LIMIT 1");
        const inserer = (table: string, row: Row) => {
            const columns = Object.keys(row);
            return Number(db.prepare(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`).run(...columns.map(c => row[c])).lastInsertRowid);
        };
        const compteArchive = (row: Row): number => {
            const numero = `archive-recuperation:${row.agent_id ?? 'sans-agent'}:${row.cree_par_nom ?? ''}`;
            const existant = db.prepare('SELECT id FROM users WHERE number = ?').get(numero) as { id: number } | undefined;
            if (existant) return existant.id;
            const id = (db.prepare('SELECT min(0, COALESCE(min(id), 0)) - 1 AS id FROM users').get() as { id: number }).id;
            inserer('users', { id, uuid: randomUUID(), name: row.cree_par_nom ?? 'Compte supprimé', number: numero, password: '!', role: 'agent', actif: 0, supprime_localement: 1, agent_id: row.agent_id ?? null });
            return id;
        };

        for (const [table, references] of Object.entries(refs)) {
            ids[table] = new Map();
            ajoutes[table] = 0;
            existants[table] = 0;
            const columns = colonneLocales(table);
            for (const remote of snapshot.tables[table] ?? []) {
                if (!Number.isSafeInteger(remote.id) || !remote.uuid) throw new Error('Sauvegarde incomplète. Aucune donnée récupérée.');
                let local = db.prepare(`SELECT * FROM ${table} WHERE uuid = ?`).get(remote.uuid) as Row | undefined;
                if (!local && table === 'clients' && remote.telephone) {
                    const normalise = String(remote.telephone).replace(/\D/g, '');
                    if (normalise) local = db.prepare(`SELECT * FROM clients WHERE source = ? AND
                        replace(replace(replace(replace(replace(replace(replace(coalesce(telephone, ''), ' ', ''), '-', ''), '.', ''), '/', ''), '(', ''), ')', ''), '+', '') = ? LIMIT 1`)
                        .get(remote.source ?? 'ticket', normalise) as Row | undefined;
                }
                if (local) {
                    if (table === 'clients' && local.source !== remote.source) throw new Error('La source d’un client ne correspond pas. Aucune donnée modifiée.');
                    if (catalogue.has(table) && local.id !== remote.id) throw new Error(`Identifiants incompatibles (${table}). Aucune donnée modifiée.`);
                    if (numbers[table] && local[numbers[table]] !== remote[numbers[table]]) throw new Error('Un numéro ne correspond plus à sa vente. Récupération arrêtée.');
                    for (const champ of ['agence_id', 'agence_depart_id']) {
                        if (remote[champ] != null && local[champ] !== remote[champ]) throw new Error('Une donnée locale appartient à une autre agence. Aucune donnée modifiée.');
                    }
                    ids[table].set(Number(remote.id), Number(local.id));
                    existants[table]++;
                    continue;
                }
                if (pending.get(table, remote.uuid)) throw new Error('Une donnée manquante a encore un envoi en attente. Faites vérifier la synchronisation avant de récupérer.');
                if (catalogue.has(table)) {
                    const collision = db.prepare(`SELECT uuid FROM ${table} WHERE id = ?`).get(remote.id);
                    if (collision) throw new Error(`Identifiants incompatibles (${table}). Aucune donnée modifiée.`);
                }
                if (numbers[table] && remote[numbers[table]]) {
                    if (db.prepare(`SELECT 1 FROM ${table} WHERE ${numbers[table]} = ?`).get(remote[numbers[table]])) {
                        throw new Error('Un numéro existe déjà avec une autre identité. Aucune donnée modifiée.');
                    }
                }
                const row: Row = {};
                for (const [key, value] of Object.entries(remote)) {
                    if (!columns.has(key) || key === 'id' && !catalogue.has(table)) continue;
                    if (['password', 'actif', 'desactive_localement', 'supprime_localement'].includes(key) && table === 'users') continue;
                    row[key] = value;
                }
                for (const [key, cible] of Object.entries(references)) {
                    const remoteId = remote[key];
                    row[key] = remoteId == null ? null : ids[cible]?.get(Number(remoteId)) ?? null;
                    if (remoteId != null && row[key] === null) throw new Error('Une donnée liée manque dans la sauvegarde. Aucune donnée récupérée.');
                }
                if (table === 'users') {
                    // Historical identity only: restoring sales never grants access.
                    row.number = row.number ?? row.email ?? `archive:${row.uuid}`;
                    row.password = '!';
                    row.actif = 0;
                }
                for (const key of ['user_id', 'cree_par_user_id']) {
                    if (key in references && row[key] === null) row[key] = compteArchive({ ...row, cree_par_nom: remote.cree_par_nom ?? null });
                }
                if (table === 'courriers' && columns.has('voyage_uuid')) row.voyage_uuid = snapshot.tables.voyages.find(v => v.id === remote.voyage_id)?.uuid ?? null;
                if (table === 'colis' || table === 'colis_internationaux') {
                    const parent = table === 'colis' ? 'courriers' : 'courriers_internationaux';
                    const fk = table === 'colis' ? 'courrier_id' : 'courrier_international_id';
                    if (!nouveauxParents.has(`${parent}:${row[fk]}`)) {
                        const localParent = db.prepare(`SELECT uuid, updated_at FROM ${parent} WHERE id = ?`).get(row[fk]) as Row;
                        const remoteParent = snapshot.tables[parent].find(p => p.id === remote[fk])!;
                        if (pending.get(parent, localParent.uuid) || Math.floor(Date.parse(String(localParent.updated_at)) / 1000) !== Math.floor(Date.parse(String(remoteParent.updated_at)) / 1000)) {
                            throw new Error('Un courrier local a été modifié. Faites vérifier sa synchronisation avant de récupérer ses colis.');
                        }
                    }
                }
                if (table === 'tickets' && row.statut_ticket === 'valide') {
                    if (db.prepare("SELECT 1 FROM tickets WHERE voyage_id = ? AND numero_place = ? AND statut_ticket <> 'annule'").get(row.voyage_id, row.numero_place)) {
                        throw new Error('Une place est déjà occupée par un autre ticket local. Aucune donnée modifiée.');
                    }
                }
                if (table === 'lots_bordereaux' && db.prepare('SELECT 1 FROM lots_bordereaux WHERE agence_id = ? AND type = ? AND numero_lot = ?').get(row.agence_id, row.type, row.numero_lot)) {
                    throw new Error('Ce numéro de lot appartient déjà à un autre lot local. Aucune donnée modifiée.');
                }
                if (columns.has('recupere_admin_at')) row.recupere_admin_at = maintenant;
                const id = inserer(table, row);
                ids[table].set(Number(remote.id), id);
                nouveauxParents.add(`${table}:${id}`);
                ajoutes[table]++;
                if (table === 'lots_bordereaux') nouveauxLots.add(id);
                if (['clients', 'voyages', ...Object.values(sales), 'lots_bordereaux'].includes(table)) {
                    db.prepare("INSERT INTO sync_queue (entite, entite_uuid, operation, payload, statut, synced_at) VALUES (?, ?, 'create', ?, 'synchronise', ?)")
                        .run(table, remote.uuid, JSON.stringify({ origine: 'recuperation_admin' }), maintenant);
                }
            }
        }

        for (const lien of snapshot.liaisons_itineraires ?? []) {
            const itineraireId = ids.itineraires.get(Number(lien.itineraire_id));
            const trajetId = ids.trajets.get(Number(lien.trajet_id));
            if (!itineraireId || !trajetId) throw new Error('Itinéraire incomplet. Aucune donnée récupérée.');
            if (!db.prepare('SELECT 1 FROM itineraire_trajet WHERE itineraire_id = ? AND trajet_id = ?').get(itineraireId, trajetId)) {
                db.prepare('INSERT INTO itineraire_trajet (itineraire_id, trajet_id, ordre_depart, ordre_arrivee) VALUES (?, ?, ?, ?)')
                    .run(itineraireId, trajetId, lien.ordre_depart, lien.ordre_arrivee);
            }
        }
        let liensAjoutes = 0;
        if (snapshot.section !== 'ticket') {
            const [pivot, colonne] = snapshot.section === 'bagage' ? ['lot_bagages', 'bagage_id'] : snapshot.section === 'courrier' ? ['lot_courriers', 'courrier_id'] : ['lot_courriers_internationaux', 'courrier_international_id'];
            for (const lien of snapshot.liens_lots) {
                const lotId = ids.lots_bordereaux.get(Number(lien.lot_id));
                const elementId = ids[sales[snapshot.section]].get(Number(lien[colonne]));
                if (!lotId || !elementId) throw new Error('Bordereau incomplet. Aucune donnée récupérée.');
                const remoteLot = snapshot.tables.lots_bordereaux.find(l => l.id === lien.lot_id)!;
                const dejaLie = db.prepare(`SELECT lot_id FROM ${pivot} WHERE ${colonne} = ?`).get(elementId) as { lot_id: number } | undefined;
                if (dejaLie && dejaLie.lot_id !== lotId) throw new Error('Un envoi appartient déjà à un autre lot local. Aucune donnée modifiée.');
                if (dejaLie) continue;
                if (!nouveauxLots.has(lotId)) {
                    const local = db.prepare('SELECT updated_at FROM lots_bordereaux WHERE id = ?').get(lotId) as Row;
                    if (pending.get('lots_bordereaux', remoteLot.uuid) || Math.floor(Date.parse(String(local.updated_at)) / 1000) !== Math.floor(Date.parse(String(remoteLot.updated_at)) / 1000)) {
                        throw new Error('Un lot local a été modifié. Faites vérifier sa synchronisation avant de récupérer ses envois.');
                    }
                }
                db.prepare(`INSERT INTO ${pivot} (lot_id, ${colonne}, created_at) VALUES (?, ?, ?)`).run(lotId, elementId, lien.created_at);
                liensAjoutes++;
            }
        }
        for (const [table, lignes] of Object.entries(snapshot.numerotation)) {
            if (!sequences[table]) continue;
            for (const { prefixe, numero } of lignes) {
                if (!/^(?:[A-Z0-9]{3})?\d{3}$/.test(prefixe) || !/^\d{6}$/.test(numero.slice(prefixe.length))) continue;
                const key = `${sequences[table]}_${prefixe}`;
                const ancien = Number((db.prepare('SELECT valeur FROM config WHERE cle = ?').get(key) as { valeur: string } | undefined)?.valeur ?? 0);
                db.prepare('INSERT INTO config(cle, valeur) VALUES (?, ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur')
                    .run(key, String(Math.max(ancien, Number(numero.slice(prefixe.length)))));
            }
        }
        return { ajoutes, existants, liensAjoutes, ventesSelectionnees: snapshot.ventes_selectionnees };
    })();
}
