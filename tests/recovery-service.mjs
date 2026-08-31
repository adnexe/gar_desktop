import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

let role = 'super_admin';
let session = true;
let agence = { id: 1, uuid: 'agence-test' };
let imports = 0;
let fetches = 0;
let fetchResult = async () => ({ section: 'ticket', date: '2026-08-31' });
const logs = [];
const mocks = {
    '../apiClient': { recupererVentesAdmin: async () => { fetches++; return fetchResult(); } },
    '../database/connection': { getDb: () => ({}) },
    '../database/migrate': { migrer: () => {} },
    '../logger': { logger: { info: (...args) => logs.push(args) } },
    '../repositories/AgenceRepository': { AgenceRepository: class { actuelle() { return agence; } } },
    '../repositories/ConfigRepository': { ConfigRepository: class { obtenir() { return 'token'; } } },
    '../repositories/UserRepository': { UserRepository: class { gestionnaire() { return { id: 1, uuid: 'user', role }; } } },
    '../controllers/VenteController': { VenteController: {} },
    './RecoveryImport': { importerRecuperation: () => { imports++; return { ajoutes: {} }; } },
};
const exports = {};
vm.runInNewContext(ts.transpileModule(readFileSync('electron/services/RecoveryService.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports, require: name => { if (!mocks[name]) throw new Error(`Unexpected dependency ${name}`); return mocks[name]; } });
const demande = { section: 'ticket', date: '2026-08-31', userId: 1, password: 'mot-de-passe-confidentiel' };
const call = (params = demande) => exports.recupererDepuisAdmin(params, () => session);
for (const r of ['agent', 'chef_gare', 'admin']) {
    role = r;
    await assert.rejects(call(), /réservée/);
}
role = 'super_admin';
session = false;
await assert.rejects(call(), /réservée/);
assert.equal(fetches, 0);
session = true;
await assert.rejects(call({ ...demande, section: 'users' }));
fetchResult = async () => { throw new Error('Internet indisponible'); };
await assert.rejects(call(), /Internet/);
assert.equal(imports, 0);
fetchResult = async () => { session = false; return { section: 'ticket', date: demande.date }; };
await assert.rejects(call(), /changé/);
assert.equal(imports, 0, 'Une deconnexion pendant le telechargement annule la recuperation');
session = true;
fetchResult = async () => ({ section: 'bagage', date: demande.date });
await assert.rejects(call(), /correspond pas/);
let finish;
fetchResult = () => new Promise(resolve => { finish = resolve; });
const first = call();
await assert.rejects(call(), /déjà en cours/);
finish({ section: 'ticket', date: demande.date });
await first;
assert.equal(imports, 1);
assert.ok(!JSON.stringify(logs).includes(demande.password));
console.log('Recuperation service : roles, session, hors ligne, requetes concurrentes, contexte et confidentialite OK');
