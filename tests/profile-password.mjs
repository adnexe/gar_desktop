import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import vm from 'node:vm';
import ts from 'typescript';
import bcrypt from 'bcryptjs';

function charger(file, mocks) {
    const exports = {};
    vm.runInNewContext(ts.transpileModule(readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText, { exports, Buffer, Error, Date, process: { env: {} }, require: name => {
        if (!(name in mocks)) throw new Error(`Unexpected import: ${name}`);
        return mocks[name];
    } });
    return exports;
}
const db = new DatabaseSync(':memory:');
db.exec(`CREATE TABLE agences (id INTEGER PRIMARY KEY, nom TEXT, actif INTEGER);
CREATE TABLE agents (id INTEGER PRIMARY KEY, agence_id INTEGER, nom TEXT, type_agent TEXT, actif INTEGER, desactive_localement INTEGER DEFAULT 0, supprime_localement INTEGER DEFAULT 0);
CREATE TABLE users (id INTEGER PRIMARY KEY, uuid TEXT UNIQUE, name TEXT, email TEXT, number TEXT, password TEXT, role TEXT, agent_id INTEGER, actif INTEGER, desactive_localement INTEGER DEFAULT 0, supprime_localement INTEGER DEFAULT 0, updated_at TEXT);
INSERT INTO agences VALUES (1, 'Adjame', 1);
INSERT INTO agents (id, agence_id, nom, type_agent, actif) VALUES (1,1,'Awa','ticket',1);
INSERT INTO users (id,uuid,name,number,password,role,agent_id,actif) VALUES (1,'uuid-agent','Awa','0101010101','old','agent',1,1),(2,'uuid-super','Super','00000000','other','super_admin',NULL,1);`);
const usersModule = charger('electron/repositories/UserRepository.ts', { '../database/connection': { getDb: () => db } });
const users = new usersModule.UserRepository();
const lock = charger('electron/services/CompteSyncLock.ts', {});
let online = true, sessionId = 1, fetches = 0, writes = 0;
let agence = { uuid: 'agence-1' };
let response = async () => ({ uuid: 'uuid-agent', updated_at: '2026-08-31T10:00:00.000Z' });
const logs = [];
const originalUpdate = usersModule.UserRepository.prototype.modifierMotDePasseConfirme;
usersModule.UserRepository.prototype.modifierMotDePasseConfirme = function (...args) { writes++; return originalUpdate.apply(this, args); };
const mocks = {
    bcryptjs: bcrypt,
    electron: { net: { isOnline: () => online } },
    '../apiClient': { modifierMotDePasseAdmin: async (...args) => { fetches++; return response(...args); } },
    '../repositories/AgenceRepository': { AgenceRepository: class { actuelle() { return agence; } } },
    '../repositories/ConfigRepository': { ConfigRepository: class { obtenir() { return 'token'; } } },
    '../repositories/UserRepository': usersModule,
    '../logger': { logger: { info: (...args) => logs.push(args), warn: (...args) => logs.push(args) } },
    './CompteSyncLock': lock,
};
const profile = charger('electron/services/ProfileService.ts', mocks);
const params = { currentPassword: 'Ancien-test-123', password: 'Nouveau-test-456', confirmation: 'Nouveau-test-456' };
const call = (p = params, id = 1) => profile.modifierMotDePasse(id, p, () => sessionId === id);
const hashLocal = () => db.prepare('SELECT password FROM users WHERE id=1').get().password;
assert.equal(profile.profilConnecte(1).nom, 'Awa');
assert.ok(!('password' in profile.profilConnecte(1)));
assert.throws(() => profile.profilConnecte(null), /Reconnectez/);
sessionId = null;
await assert.rejects(call(), /Reconnectez/);
sessionId = 1;
online = false;
await assert.rejects(call(), /Internet/);
assert.equal(fetches, 0);
assert.equal(writes, 0);
online = true;
for (const p of [{ ...params, confirmation: 'incorrect' }, { ...params, password: 'short' }, { ...params, password: 'é'.repeat(37) }, { ...params, password: params.currentPassword, confirmation: params.currentPassword }]) {
    await assert.rejects(call(p), /Renseignez/);
}
db.prepare('UPDATE users SET desactive_localement=1 WHERE id=1').run();
await assert.rejects(call(), /Reconnectez/);
db.prepare('UPDATE users SET desactive_localement=0 WHERE id=1').run();
assert.equal(fetches, 0);

response = async () => { throw new Error('Admin injoignable'); };
await assert.rejects(call(), /injoignable/);
assert.equal(hashLocal(), 'old');
assert.equal(writes, 0);

let finish, started;
const pendingStarted = new Promise(resolve => { started = resolve; });
response = (...args) => { assert.equal(args[1], 'uuid-agent'); started(); return new Promise(resolve => { finish = resolve; }); };
const pending = call();
await pendingStarted;
assert.equal(hashLocal(), 'old', 'Aucune mise a jour locale avant confirmation admin');
await assert.rejects(call(), /déjà en cours/);
finish({ uuid: 'uuid-agent', updated_at: '2026-08-31T10:00:00.000Z' });
assert.equal((await pending).ok, true);
assert.ok(await bcrypt.compare(params.password, hashLocal()));
assert.ok(!await bcrypt.compare(params.currentPassword, hashLocal()));
assert.equal(users.parIdentifiant('0101010101').uuid, 'uuid-agent');
assert.equal(db.prepare('SELECT role FROM users WHERE id=1').get().role, 'agent');
assert.equal(db.prepare('SELECT password FROM users WHERE id=2').get().password, 'other');

// Une deconnexion ne doit pas laisser l'ancien hash sur le compte d'origine
// quand admin a deja confirme ; aucun secret n'est applique au nouveau compte.
sessionId = 1;
response = async () => { sessionId = 2; return { uuid: 'uuid-agent', updated_at: '2026-08-31T11:00:00.000Z' }; };
await call();
assert.ok(await bcrypt.compare(params.password, hashLocal()));
assert.equal(db.prepare('SELECT password FROM users WHERE id=2').get().password, 'other');
sessionId = 1;
response = async () => ({ uuid: 'wrong-user', updated_at: '2026-08-31T11:00:00.000Z' });
const before = hashLocal();
await assert.rejects(call(), /admin, mais ce poste/);
assert.equal(hashLocal(), before);

// Vraies methodes BootstrapService et verrou partage : une ancienne reponse
// catalogue se termine avant le changement, jamais apres.
let finishBootstrap, startedBootstrap;
let remoteHash = await bcrypt.hash(params.currentPassword, 4);
const bootstrapStarted = new Promise(resolve => { startedBootstrap = resolve; });
let bootstrapFetch = () => { const snapshot = remoteHash; startedBootstrap(); return new Promise(resolve => { finishBootstrap = () => resolve({ password: snapshot, token: 'token', agence: { reference: 'AG-TEST' } }); }); };
const { BootstrapService } = charger('electron/services/BootstrapService.ts', {
    axios: { isAxiosError: () => false },
    '../apiClient': { bootstrap: () => bootstrapFetch() },
    '../repositories/AgenceRepository': mocks['../repositories/AgenceRepository'],
    '../repositories/ConfigRepository': { ConfigRepository: class { obtenir() { return 'test'; } definir() {} } },
    '../repositories/CatalogueRepository': { CatalogueRepository: class { seed(data) { db.prepare('UPDATE users SET password=? WHERE id=1').run(data.password); } } },
    '../repositories/CompagnieRepository': { CompagnieRepository: class {} },
    '../database/migrate': { migrer() {} },
    '../database/connection': { getDb: () => db },
    '../logger': mocks['../logger'], './CompteSyncLock': lock,
});
const bootstrap = new BootstrapService();
const oldRefresh = bootstrap.actualiser();
await bootstrapStarted;
response = async () => { remoteHash = await bcrypt.hash(params.password, 4); return { uuid: 'uuid-agent', updated_at: '2026-08-31T12:00:00.000Z' }; };
const beforeFetch = fetches;
const change = call();
await Promise.resolve();
assert.equal(fetches, beforeFetch, 'La modification attend le catalogue deja en cours');
finishBootstrap();
await oldRefresh;
await change;
assert.ok(await bcrypt.compare(params.password, hashLocal()));
bootstrapFetch = async () => ({ password: remoteHash, token: 'token', agence: { reference: 'AG-TEST' } });
await bootstrap.actualiser();
assert.ok(await bcrypt.compare(params.password, hashLocal()));

const { AuthService } = charger('electron/services/AuthService.ts', {
    bcryptjs: bcrypt, electron: mocks.electron,
    '../logger': mocks['../logger'],
    '../repositories/ConfigRepository': mocks['../repositories/ConfigRepository'],
    '../repositories/UserRepository': usersModule,
    '../sync/SyncEngine': { syncEngine: { planifier() {} } },
    './BootstrapService': { BootstrapService },
});
online = false;
const auth = new AuthService();
assert.equal((await auth.connecter('0101010101', params.password)).userId, 1);
await assert.rejects(auth.connecter('0101010101', params.currentPassword), /IDENTIFIANTS_INVALIDES/);
online = true;

await assert.rejects(lock.avecVerrouComptes(async () => { throw new Error('test'); }));
assert.equal(await lock.avecVerrouComptes(async () => 42), 42, 'Un echec libere le verrou');
const traces = JSON.stringify(logs);
assert.ok(!traces.includes(params.password) && !traces.includes(params.currentPassword));
assert.ok(!traces.includes(hashLocal()));
const ipc = readFileSync('electron/ipc/index.ts', 'utf8');
assert.ok(ipc.includes("gerer('auth:profil', () => profilConnecte(utilisateurConnecteId))"));
assert.ok(ipc.includes('const userId = utilisateurConnecteId;'));
assert.ok(!readFileSync('electron/services/LocalNetworkService.ts', 'utf8').includes('auth:modifierMotDePasse'));
let status;
const api = charger('electron/apiClient/index.ts', {
    './adresse': { adresseAdmin: () => 'https://admin.test' },
    axios: { create: () => ({ post: async (path, data, options) => {
        assert.equal(path, '/api/desktop/profil/mot-de-passe');
        assert.equal(options.maxRedirects, 0);
        assert.equal(data.user_uuid, 'uuid-agent');
        throw { response: status ? { status, data: { message: params.password } } : undefined, config: { data }, password: params.password };
    } }), isAxiosError: () => true },
});
for (const code of [401, 403, 404, 422, 429, 500, undefined]) {
    status = code;
    await assert.rejects(api.modifierMotDePasseAdmin('token', 'uuid-agent', params.currentPassword, params.password, params.confirmation), error => {
        assert.ok(error instanceof Error);
        assert.ok(!String(error).includes(params.password));
        assert.ok(!String(error).includes(params.currentPassword));
        if (!code || code === 500) assert.match(error.message, /peut-être/);
        return true;
    });
}
db.close();
console.log('Profil : session, hors ligne, validation, SQLite, confirmation admin, concurrence catalogue, deconnexion, absence de secrets et IPC local OK');
