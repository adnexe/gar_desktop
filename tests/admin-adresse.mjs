import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import vm from 'node:vm';
import ts from 'typescript';

function charger(file, mocks, env = {}) {
    const exports = {};
    vm.runInNewContext(ts.transpileModule(readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText, { exports, URL, Error, AbortSignal, process: { env }, require: name => {
        if (!(name in mocks)) throw new Error(`Unexpected import: ${name}`);
        return mocks[name];
    } });
    return exports;
}

const db = new DatabaseSync(':memory:');
db.transaction = operation => () => {
    db.exec('BEGIN');
    try { const result = operation(); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
};
db.exec(`CREATE TABLE config (cle TEXT PRIMARY KEY, valeur TEXT);
CREATE TABLE villes (id INTEGER PRIMARY KEY, nom TEXT);
CREATE TABLE agences (id INTEGER PRIMARY KEY, uuid TEXT, reference TEXT, telephone TEXT, nom TEXT, ville_id INTEGER);
CREATE TABLE tickets (id INTEGER PRIMARY KEY, montant INTEGER);
INSERT INTO villes VALUES (1, 'Abidjan');
INSERT INTO agences VALUES (4, 'uuid-adjame', 'AG-ADJ', NULL, 'Adjame', 1);
INSERT INTO tickets VALUES (1, 5000);`);
const connection = { getDb: () => db };
const repository = charger('electron/repositories/ConfigRepository.ts', { '../database/connection': connection });
const config = new repository.ConfigRepository();
const adresseMocks = { '../repositories/ConfigRepository': repository };
const adresse = charger('electron/apiClient/adresse.ts', adresseMocks, { GAR_API_URL: 'https://ancien.test/' });
assert.equal(adresse.adresseAdmin(), 'https://ancien.test', 'Ancien .env conserve sans migration');
assert.equal(charger('electron/apiClient/adresse.ts', adresseMocks).adresseAdmin(), 'http://127.0.0.1:8000');
for (const value of ['', null, 123, 'ftp://serveur.test', 'file:///tmp/test', 'javascript:alert(1)', 'admin.test', 'https://user:secret@admin.test', 'https://admin.test/?token=secret', 'https://admin.test/#connexion', 'https://admin.test/api', 'https://admin.test/api/desktop']) {
    assert.throws(() => adresse.normaliserAdresseAdmin(value));
}
assert.equal(adresse.normaliserAdresseAdmin(' HTTPS://Admin.TEST/sous-dossier/// '), 'https://admin.test/sous-dossier');
assert.equal(adresse.normaliserAdresseAdmin('http://192.168.1.10:8000/'), 'http://192.168.1.10:8000');

let role = 'super_admin', actif = true, session = true, checks = 0;
const valide = () => ({ agence: { id: 4, uuid: 'uuid-adjame', reference: 'AG-ADJ', actif: true }, token: 'jeton-nouveau' });
let verifier = async () => valide();
const logs = [];
const service = charger('electron/services/AdminAdresseService.ts', {
    '../apiClient': { apiBaseUrl: adresse.adresseAdmin, verifierAdresseAdmin: async (...args) => { checks++; return verifier(...args); } },
    '../apiClient/adresse': adresse,
    '../database/connection': connection,
    '../repositories/ConfigRepository': repository,
    '../repositories/AgenceRepository': charger('electron/repositories/AgenceRepository.ts', { '../database/connection': connection }),
    '../repositories/UserRepository': { UserRepository: class { sessionValide() { return { ok: actif }; } gestionnaire() { return { role }; } } },
    './CompteSyncLock': charger('electron/services/CompteSyncLock.ts', {}),
    '../logger': { logger: { info: (...args) => logs.push(args) } },
});
const enregistrer = (url, id = 1) => service.enregistrerAdresseAdmin(url, id, () => session);
await enregistrer('https://premier.test/', null);
assert.equal(adresse.adresseAdmin(), 'https://premier.test');
assert.equal(checks, 0, 'Premier reglage avant reclamation de licence');
assert.equal(charger('electron/apiClient/adresse.ts', adresseMocks, { GAR_API_URL: 'https://autre-build.test' }).adresseAdmin(), 'https://premier.test', 'Persistance prioritaire apres nouveau build');

config.definir('agence_reference', 'AG-ADJ');
config.definir('api_token', 'jeton-initial');
config.definir('licence_uuid', 'licence-conservee');
for (const r of ['admin', 'agent', 'chef_gare']) {
    role = r;
    await assert.rejects(enregistrer('https://nouveau.test'), /super administrateur/);
}
role = 'super_admin';
actif = false;
await assert.rejects(enregistrer('https://nouveau.test'), /super administrateur/);
actif = true;
await assert.rejects(enregistrer('https://nouveau.test', null), /super administrateur/);
session = false;
await assert.rejects(enregistrer('https://nouveau.test'), /super administrateur/);
session = true;
assert.equal(checks, 0);

verifier = async () => { throw new Error('Hors ligne'); };
await assert.rejects(enregistrer('https://nouveau.test'), /Hors ligne/);
for (const bad of [
    { ...valide(), agence: { ...valide().agence, uuid: 'autre' } },
    { ...valide(), agence: { ...valide().agence, id: 7 } },
    { ...valide(), agence: { ...valide().agence, reference: 'AG-AUTRE' } },
    { ...valide(), agence: { ...valide().agence, actif: false } },
    { ...valide(), token: '' }, {},
]) {
    verifier = async () => bad;
    await assert.rejects(enregistrer('https://nouveau.test'), /même agence/);
    assert.equal(config.obtenir('admin_url'), 'https://premier.test');
    assert.equal(config.obtenir('api_token'), 'jeton-initial');
}
verifier = async () => { session = false; return valide(); };
await assert.rejects(enregistrer('https://nouveau.test'), /super administrateur/);
session = true;
assert.equal(config.obtenir('admin_url'), 'https://premier.test');
verifier = async (url, reference) => { assert.equal(url, 'https://nouveau.test'); assert.equal(reference, 'AG-ADJ'); return valide(); };
db.exec("CREATE TRIGGER refuser_jeton BEFORE UPDATE ON config WHEN NEW.cle = 'api_token' BEGIN SELECT RAISE(ABORT, 'echec disque simule'); END;");
await assert.rejects(enregistrer('https://nouveau.test'), /echec disque/);
assert.equal(config.obtenir('admin_url'), 'https://premier.test', 'Rollback adresse si ecriture jeton echoue');
assert.equal(config.obtenir('api_token'), 'jeton-initial');
db.exec('DROP TRIGGER refuser_jeton');
await enregistrer('https://nouveau.test/');
assert.equal(adresse.adresseAdmin(), 'https://nouveau.test');
assert.equal(config.obtenir('api_token'), 'jeton-nouveau');
assert.equal(config.obtenir('licence_uuid'), 'licence-conservee');
assert.equal(db.prepare('SELECT COUNT(*) AS n FROM tickets').get().n, 1);
const beforeChecks = checks;
await enregistrer('https://nouveau.test');
assert.equal(checks, beforeChecks, 'Enregistrer la meme adresse ne reclame pas de nouvelle licence');
assert.ok(!JSON.stringify(logs).includes('jeton-'));

const requests = [];
let respond = async () => ({ data: { ok: true, ...valide() } });
const api = charger('electron/apiClient/index.ts', {
    './adresse': adresse,
    axios: { create: () => ({ post: async (...args) => { requests.push(args); return respond(...args); } }), isAxiosError: () => false },
});
await api.bootstrap('AG-ADJ', 'poste');
await api.reclamerLicence('AG-ADJ', 'poste', 'licence-conservee', '004');
await api.envoyerOperationSync('jeton-nouveau', { entite: 'tickets', uuid: 'ticket-test', operation: 'create', payload: {} });
await api.envoyerPresencePoste('jeton-nouveau', {}, 1000, AbortSignal.timeout(1000));
await api.recupererVentesAdmin('jeton-nouveau', 'ticket', '2026-08-31', 'super', 'test-password');
await api.modifierMotDePasseAdmin('jeton-nouveau', 'super', 'old-password', 'new-password', 'new-password');
assert.equal(requests.length, 6);
for (const request of requests) assert.equal(request[2].baseURL, 'https://nouveau.test');
await api.verifierAdresseAdmin('https://candidat.test', 'AG-ADJ');
const probe = requests.at(-1);
assert.equal(probe[2].baseURL, 'https://candidat.test');
assert.equal(probe[2].maxRedirects, 0);
assert.equal(probe[2].headers, undefined, 'Aucun token existant transmis a la nouvelle adresse');
assert.ok(!JSON.stringify(probe).includes('password'));
assert.equal(adresse.adresseAdmin(), 'https://nouveau.test', 'La verification ne modifie pas la cible courante');

let finish;
respond = () => new Promise(resolve => { finish = resolve; });
const oldResponse = api.reclamerLicence('AG-ADJ', 'poste');
config.definir('admin_url', 'https://encore.test');
finish({ data: { ok: false, statut: 'agence_inexistante' } });
await assert.rejects(oldResponse, /Adresse admin modifiée/, 'Ancienne reponse licence ignoree, pas de reset du poste');
respond = async () => ({ data: valide() });
await api.bootstrap('AG-ADJ', 'poste');
assert.equal(requests.at(-1)[2].baseURL, 'https://encore.test', 'Cible relue sans redemarrage');
respond = async () => { throw { config: { headers: { Authorization: 'secret' } }, response: { status: 404 } }; };
await assert.rejects(api.verifierAdresseAdmin('https://absent.test', 'AG-ADJ'), error => !String(error).includes('secret') && /conservée/.test(error.message));
assert.equal(config.obtenir('licence_uuid'), 'licence-conservee');

const ipc = readFileSync('electron/ipc/index.ts', 'utf8');
assert.match(ipc, /gerer\('config:enregistrerAdresseAdmin', \(url: string\) => \{\s*const userId = utilisateurConnecteId;/);
assert.ok(!readFileSync('electron/services/LocalNetworkService.ts', 'utf8').includes('config:enregistrerAdresseAdmin'));
for (const file of ['electron/preload.ts', 'src/types/window.d.ts']) assert.ok(readFileSync(file, 'utf8').includes('enregistrerAdresseAdmin'));
db.close();
console.log('Adresse admin : validation, persistance SQLite, autorisations, identite agence, echec sans mutation, tous les appels admin, absence de secrets et reponses anciennes OK');
