import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const database = new DatabaseSync(':memory:');
const db = { prepare: (sql) => database.prepare(sql), transaction: (f) => () => { database.exec('BEGIN'); try { const r = f(); database.exec('COMMIT'); return r; } catch (e) { database.exec('ROLLBACK'); throw e; } } };
let mono = 0;
let instant = Date.parse('2026-08-30T08:00:00Z');
let timer;
let horsLigne = false;
let retenirEnvoi = false;
let liberation;
const envois = [];
const warnings = [];
const modules = new Map();
const mocks = {
    electron: { app: { getVersion: () => 'test' } },
    '../database/connection': { getDb: () => db },
    '../logger': { logger: { warn: (...args) => warnings.push(args) } },
    '../apiClient': { envoyerPresencePoste: async (_token, payload, _timeout, signal) => {
        envois.push(structuredClone(payload));
        if (horsLigne) throw new Error('hors ligne');
        if (retenirEnvoi) {
            retenirEnvoi = false;
            await new Promise((res, rej) => { liberation = res; signal.addEventListener('abort', () => rej(new Error('abort'))); });
        }
        return { acquittements: payload.periodes.map(p => ({ uuid: p.uuid, revision: p.revision })) };
    } },
};
class FakeDate extends Date { constructor(...args) { super(...(args.length ? args : [instant])); } static now() { return instant; } }
function load(path) {
    path = resolve(path);
    if (modules.has(path)) return modules.get(path);
    const module = { exports: {} };
    modules.set(path, module.exports);
    const code = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(code, {
        module, exports: module.exports,
        require: (name) => mocks[name] ?? (name.startsWith('.') ? load(resolve(path, '..', `${name}.ts`)) : require(name)),
        process, Date: FakeDate, performance: { now: () => mono }, Intl, AbortController,
        setInterval: (f) => { timer = f; return 1; }, clearInterval: () => { timer = null; },
    }, { filename: path });
    return module.exports;
}
database.exec('CREATE TABLE config(cle TEXT PRIMARY KEY, valeur TEXT); CREATE TABLE agents(id INTEGER PRIMARY KEY, uuid TEXT, nom TEXT);');
const { migrations } = load('electron/database/migrations/index.ts');
database.exec(migrations.find(m => m.nom === '0021_suivi_postes').sql);
for (const [cle, valeur] of Object.entries({ agence_reference: 'AG-TEST', licence_agence_id: '4', licence_uuid: 'test-licence', licence_code_poste: '004', api_token: 'fake-token' })) database.prepare('INSERT INTO config VALUES (?, ?)').run(cle, valeur);
database.prepare('INSERT INTO agents VALUES (?, ?, ?)').run(1, 'agent-uuid', 'Awa');
const { posteSuiviService: service } = load('electron/services/PosteSuiviService.ts');
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
const avancer = async (ms = 30000) => { mono += ms; instant += ms; timer?.(); await flush(); };
const rows = () => database.prepare('SELECT * FROM suivi_poste_periodes').all();
service.demarrer();
await flush();
assert.equal(envois[0].session_ouverte, false);
assert.equal(rows().length, 1);
service.presenceSession(true);
await avancer();
assert.equal(rows().length, 1, 'Un renderer ne peut pas inventer une session');
service.connecter({ userId: 1, uuid: 'user-uuid', nom: 'Compte Awa', role: 'caissiere', agentId: 1, agenceId: 4, typeAgent: ['ticket'] });
await flush();
assert.equal(envois.at(-1).acteur.agent_nom, 'Awa');
horsLigne = true;
for (let i = 0; i < 4; i++) { service.presenceSession(true); await avancer(); }
assert.ok(rows().some(p => p.revision > p.revision_synchro));
assert.equal(rows().filter(p => JSON.parse(p.payload).type === 'session').length, 1);
horsLigne = false;
for (let i = 0; i < 2; i++) { service.presenceSession(true); await avancer(); }
assert.ok(rows().every(p => p.revision === p.revision_synchro), 'Rattrapage apres coupure');

retenirEnvoi = true;
await avancer(60000);
const anciennes = rows().map(p => p.revision);
service.deconnecter();
liberation();
await flush();
assert.ok(rows().some((p, i) => p.revision > anciennes[i] && p.revision > p.revision_synchro), 'Un ack ancien ne masque pas une fermeture intervenue pendant la requete');
service.connecter({ userId: 1, uuid: 'user-uuid', nom: 'Awa', role: 'caissiere', agentId: 1, agenceId: 4, typeAgent: ['ticket'] });
await flush();
for (let i = 0; i < 4; i++) await avancer();
assert.equal(envois.at(-1).session_ouverte, false, 'Session sans signal du renderer expire');
service.presenceSession(true);
await avancer(60000);
assert.equal(envois.at(-1).session_ouverte, true, 'Le renderer authentifie peut reprendre apres suspension');
service.suspendre();
await flush();
assert.equal(envois.at(-1).application_ouverte, false);
await avancer(3600000);
service.reprendre();
service.presenceSession(true);
await flush();
await avancer();
assert.ok(rows().every(p => JSON.parse(p.payload).duree_ms < 3600000), 'La veille ne compte pas comme travail');
await service.arreter();
assert.equal(timer, null);
assert.equal(envois.at(-1).application_ouverte, false);
assert.ok(rows().every(p => p.fermee === 1));
assert.ok(rows().every(p => p.revision === p.revision_synchro));
assert.ok(warnings.length > 0, 'Echec reseau journalise sans exception de vente');
console.log('Service suivi poste SQLite : session locale, bail, perte reseau, reprise, ack concurrent, veille et fermeture OK');
database.close();
