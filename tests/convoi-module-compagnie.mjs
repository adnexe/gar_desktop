import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import vm from 'node:vm';
import ts from 'typescript';

const db = new DatabaseSync(':memory:');
db.exec(`
CREATE TABLE agences (id INTEGER PRIMARY KEY, actif INTEGER);
CREATE TABLE agents (id INTEGER PRIMARY KEY, agence_id INTEGER, role TEXT, type_agent TEXT,
 actif INTEGER, desactive_localement INTEGER DEFAULT 0, supprime_localement INTEGER DEFAULT 0);
CREATE TABLE users (id INTEGER PRIMARY KEY, agent_id INTEGER, role TEXT, actif INTEGER,
 desactive_localement INTEGER DEFAULT 0, supprime_localement INTEGER DEFAULT 0);
INSERT INTO agences VALUES (1,1),(2,1);
INSERT INTO agents (id,agence_id,role,type_agent,actif) VALUES
 (1,1,'caissiere','ticket',1),(2,1,'caissiere','bagage',1);
INSERT INTO users (id,agent_id,role,actif) VALUES
 (1,1,'agent',1),(2,2,'agent',1),(3,NULL,'super_admin',1);
`);
let modules = ['ticket'];
let creations = 0;
const mocks = {
  '../database/connection': { getDb: () => db },
  '../database/migrate': { migrer() {} },
  '../database/dates': { dateCaisseDuJour: () => '2026-09-06' },
  '../repositories/CompagnieRepository': { CompagnieRepository: class {
    actuelle() { return { modules_actifs: modules }; }
  } },
  '../repositories/ConvoiRepository': { ConvoiRepository: class {
    lister() { return []; }
    creer(data) { creations++; return data; }
  } },
};
const exports = {};
vm.runInNewContext(ts.transpileModule(readFileSync('electron/services/ConvoiService.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports, Error, require: name => {
  assert.ok(name in mocks, `Import inattendu : ${name}`);
  return mocks[name];
} });
const service = new exports.ConvoiService();
const demande = {
  agenceId: 1, userId: 1, precisionDestination: 'Village', nombrePlaces: 30,
  montantFixe: 50000, dateDepart: '2026-09-07', dateRetour: '2026-09-08',
};
assert.throws(() => service.liste(1, '2026-09-06', 1), /module Convoi/);
assert.throws(() => service.creer(demande), /module Convoi/);
assert.equal(creations, 0);
modules = ['convoi'];
assert.equal(service.liste(1, '2026-09-06', 1).length, 0);
assert.equal(service.creer(demande).nombrePlaces, 30);
assert.throws(() => service.creer({ ...demande, userId: 2 }), /CAISSIERE/);
assert.throws(() => service.creer({ ...demande, agenceId: 2 }), /NON_AUTORISE/);
modules = ['courrier'];
assert.equal(service.creer({ ...demande, userId: 3 }).userId, 3);
db.close();
console.log('Convoi : module compagnie, creation, perimetre agence et exception super_admin OK.');
