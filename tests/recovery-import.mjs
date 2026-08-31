import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { migrations } from '../electron/database/migrations/index.ts';
import { importerRecuperation } from '../electron/services/RecoveryImport.ts';

const fixturePath = process.argv[2] ?? '/tmp/gar-recovery-fixture.json';
if (!process.argv[2]) execFileSync('php', ['artisan', 'test', '--compact', '--filter=DesktopRecoveryTest::test_quatre_sections_relations_dates_et_aucun_secret_exporte'], {
    cwd: new URL('../../admin/', import.meta.url), env: { ...process.env, RECOVERY_FIXTURE: fixturePath }, stdio: 'inherit',
});
const snapshots = JSON.parse(readFileSync(fixturePath, 'utf8'));
const agence = { id: snapshots.ticket.agence_id, uuid: snapshots.ticket.agence_uuid };
function base() {
    const sql = new DatabaseSync(':memory:');
    sql.exec('PRAGMA foreign_keys = ON');
    for (const m of migrations) sql.exec(m.sql);
    const db = {
        prepare: (q) => sql.prepare(q),
        transaction: (fn) => () => { sql.exec('BEGIN'); try { const r = fn(); sql.exec('COMMIT'); return r; } catch (e) { sql.exec('ROLLBACK'); throw e; } },
    };
    return { sql, db, get: (q, ...args) => sql.prepare(q).get(...args), count: (table) => sql.prepare(`SELECT count(*) AS n FROM ${table}`).get().n };
}
const copy = (o) => structuredClone(o);
const insert = (sql, table, row) => {
    const columns = Object.keys(row);
    sql.prepare(`INSERT INTO ${table} (${columns}) VALUES (${columns.map(() => '?')})`).run(...columns.map(k => row[k]));
};

{
    const b = base();
    const catalogue = copy(snapshots.ticket);
    catalogue.tables.tickets = [];
    catalogue.tables.voyages = [];
    catalogue.tables.clients = [];
    importerRecuperation(b.db, catalogue, agence);
    const client = snapshots.ticket.tables.clients[0];
    insert(b.sql, 'clients', { ...client, id: 900, uuid: 'client-local-existant', nom: 'Nom local conservé' });
    const voyage = snapshots.ticket.tables.voyages[0];
    insert(b.sql, 'voyages', { ...voyage, id: 800 });
    insert(b.sql, 'tickets', { ...snapshots.ticket.tables.tickets[0], id: 500, uuid: 'ticket-local', numero_ticket: 'TEST000000001', voyage_id: 800, client_id: 900, numero_place: 49 });
    for (const snap of Object.values(snapshots)) importerRecuperation(b.db, snap, agence);
    const ticket = b.get('SELECT * FROM tickets WHERE uuid = ?', snapshots.ticket.tables.tickets[0].uuid);
    assert.equal(ticket.id, 501, 'Les IDs admin ne remplacent pas les IDs SQLite');
    assert.equal(ticket.voyage_id, 800);
    assert.equal(ticket.client_id, 900, 'Client dedoublonne par telephone et source sans changer son UUID');
    assert.equal(b.get('SELECT nom FROM clients WHERE id = 900').nom, 'Nom local conservé');
    assert.equal(b.get('SELECT ticket_id FROM bagages').ticket_id, ticket.id);
    assert.equal(ticket.agent_id, snapshots.ticket.tables.tickets[0].agent_id);
    assert.ok(ticket.recupere_admin_at);
    assert.equal(b.count('clients'), 3, 'Ticket et courrier restent deux sources separees');
    assert.equal(b.count('lots_bordereaux'), 3);
    assert.equal(b.count('lot_courriers'), 1);
    assert.equal(b.count('lot_bagages'), 1);
    assert.equal(b.count('lot_courriers_internationaux'), 1);
    assert.equal(b.count('itineraire_trajet'), 1);
    assert.equal(b.get("SELECT count(*) AS n FROM sync_queue WHERE statut != 'synchronise'").n, 0, 'Pas de renvoi des ventes recuperees');
    assert.equal(b.get('SELECT actif FROM users WHERE id = ?', snapshots.ticket.tables.users[0].id).actif, 0, 'Une recuperation ne donne pas un acces de connexion');
    const avant = ['tickets', 'clients', 'colis', 'colis_internationaux', 'sync_queue'].map(t => b.count(t));
    for (const snap of Object.values(snapshots)) {
        const replay = importerRecuperation(b.db, snap, agence);
        assert.equal(Object.values(replay.ajoutes).reduce((a, n) => a + n, 0), 0);
    }
    assert.deepEqual(['tickets', 'clients', 'colis', 'colis_internationaux', 'sync_queue'].map(t => b.count(t)), avant);
    assert.equal(b.sql.prepare('PRAGMA foreign_key_check').all().length, 0);
    assert.equal(b.get("SELECT valeur FROM config WHERE cle = 'ticket_sequence_ADJ001'").valeur, '1');
    const counter = copy(snapshots.ticket);
    counter.numerotation.tickets[0].numero = 'ADJ001000090';
    importerRecuperation(b.db, counter, agence);
    importerRecuperation(b.db, snapshots.ticket, agence);
    assert.equal(b.get("SELECT valeur FROM config WHERE cle = 'ticket_sequence_ADJ001'").valeur, '90', 'Les compteurs ne reculent jamais');
    b.sql.prepare("UPDATE tickets SET statut_ticket = 'annule', montant = 123 WHERE uuid = ?").run(ticket.uuid);
    importerRecuperation(b.db, snapshots.ticket, agence);
    assert.equal(b.get('SELECT statut_ticket FROM tickets WHERE uuid = ?', ticket.uuid).statut_ticket, 'annule');
    assert.equal(b.get('SELECT montant FROM tickets WHERE uuid = ?', ticket.uuid).montant, 123, 'Une ligne existante ne change pas');
    b.sql.close();
}

for (const conflit of ['numero', 'place', 'lot']) {
    const b = base();
    const snap = copy(snapshots.courrier);
    if (conflit === 'lot') {
        importerRecuperation(b.db, snap, agence);
        b.sql.prepare("UPDATE lots_bordereaux SET uuid = 'autre-lot', reference = 'AUTRE' WHERE id = 1").run();
    } else {
        importerRecuperation(b.db, snapshots.ticket, agence);
        if (conflit === 'numero') b.sql.prepare("UPDATE tickets SET uuid = 'autre-ticket'").run();
        else b.sql.prepare("UPDATE tickets SET uuid = 'autre-ticket', numero_ticket = 'AUTRE'").run();
    }
    const before = b.count('sync_queue');
    assert.throws(() => importerRecuperation(b.db, conflit === 'lot' ? snap : snapshots.bagage, agence));
    assert.equal(b.count('sync_queue'), before);
    assert.equal(b.count('bagages'), 0, 'Une erreur ne laisse pas une restauration partielle');
    b.sql.close();
}

{
    const b = base();
    const incomplet = copy(snapshots.bagage);
    incomplet.tables.voyages = [];
    assert.throws(() => importerRecuperation(b.db, incomplet, agence), /liée manque/);
    assert.equal(b.count('agences'), 0, 'Toute la transaction est annulee, referentiels inclus');
    assert.throws(() => importerRecuperation(b.db, snapshots.ticket, { ...agence, uuid: 'autre-agence' }));
    const archive = copy(snapshots.courrier);
    archive.tables.lots_bordereaux[0].cree_par_user_id = null;
    importerRecuperation(b.db, archive, agence);
    const creator = b.get('SELECT u.* FROM users u JOIN lots_bordereaux l ON l.cree_par_user_id = u.id');
    assert.equal(creator.name, 'Super');
    assert.equal(creator.actif, 0);
    assert.equal(creator.supprime_localement, 1);
    assert.ok(creator.id < 0, 'Une ancienne identite ne consomme pas un ID utilisateur admin');
    b.sql.close();
}
{
    const b = base();
    importerRecuperation(b.db, snapshots.courrier, agence);
    b.sql.prepare('DELETE FROM lot_courriers').run();
    b.sql.prepare("INSERT INTO sync_queue(entite,entite_uuid,operation,payload) VALUES ('lots_bordereaux', ?, 'update', '{}')").run(snapshots.courrier.tables.lots_bordereaux[0].uuid);
    assert.throws(() => importerRecuperation(b.db, snapshots.courrier, agence), /lot local a été modifié/);
    assert.equal(b.count('lot_courriers'), 0, 'Une suppression locale en attente ne doit pas etre annulee par le backup');
    b.sql.close();
}
console.log('Recuperation : vrai export Laravel -> SQLite, 4 sections, UUID/IDs, liens, doublons, compteurs, droits historiques et rollback OK');
