import assert from 'node:assert/strict';
import { PosteJournal } from '../electron/services/PosteJournal.ts';

const acteur = { user_uuid: 'agent-a', agent_uuid: 'a', agent_nom: 'A' };
const date = (heure) => new Date(`2026-08-30T${heure}`);
const saved = new Map();
const save = (p) => saved.set(p.uuid, structuredClone(p));
const journal = new PosteJournal(save, date('08:00:00'), 0);
journal.avancer(date('08:00:30'), 30000);
assert.equal([...saved.values()].filter(p => p.type === 'session').length, 0, 'La page connexion ne compte pas comme une session');
journal.session(acteur, date('08:01:00'), 60000);
journal.avancer(date('08:01:30'), 90000);
journal.session(null, date('08:02:00'), 120000);
journal.fermerTout(date('08:02:30'), 150000, 'fermeture');
assert.equal([...saved.values()].find(p => p.type === 'application').duree_ms, 150000);
assert.equal([...saved.values()].find(p => p.type === 'session').duree_ms, 60000);
assert.equal([...saved.values()].find(p => p.type === 'session').fin_motif, 'deconnexion');

saved.clear();
const nuit = new PosteJournal(save, date('23:59:45'), 0);
nuit.session(acteur, date('23:59:45'), 0);
nuit.avancer(new Date('2026-08-31T00:00:15'), 30000);
for (const type of ['application', 'session']) {
    const rows = [...saved.values()].filter(p => p.type === type);
    assert.equal(rows.length, 2);
    assert.deepEqual(rows.map(p => p.duree_ms), [15000, 15000]);
    assert.deepEqual(rows.map(p => p.date_jour), ['2026-08-30', '2026-08-31']);
}

saved.clear();
const crash = new PosteJournal(save, date('09:00:00'), 0);
crash.avancer(date('09:00:30'), 30000);
const ouvertes = [...saved.values()];
new PosteJournal(save, new Date('2026-08-31T08:00:00'), 0, ouvertes);
assert.equal(saved.get(ouvertes[0].uuid).fin_local, '2026-08-30T09:00:30');
assert.equal(saved.get(ouvertes[0].uuid).fermeture_estimee, true);
assert.equal(saved.get(ouvertes[0].uuid).duree_ms, 30000, 'Aucune nuit ajoutee apres crash');

saved.clear();
const horloge = new PosteJournal(save, date('10:00:00'), 0);
horloge.avancer(date('10:00:30'), 30000);
horloge.avancer(date('09:00:45'), 45000);
assert.equal([...saved.values()][0].duree_ms, 30000);
assert.equal([...saved.values()][0].fermeture_estimee, true);
assert.ok([...saved.values()].every(p => p.duree_ms >= 0));
horloge.avancer(date('11:00:00'), 7200000);
assert.equal([...saved.values()].reduce((total, p) => total + p.duree_ms, 0), 30000, 'Veille non signalee non comptee');

saved.clear();
const offline = new PosteJournal(save, date('12:00:00'), 0);
offline.session(acteur, date('12:00:00'), 0);
for (let n = 1; n <= 120; n++) offline.avancer(new Date(date('12:00:00').getTime() + n * 30000), n * 30000);
assert.equal([...saved.values()].find(p => p.type === 'session').duree_ms, 3600000, 'Le journal avance hors ligne sans appel reseau');
assert.equal(saved.size, 2, 'Pas de nouvelle ligne par heartbeat');
saved.clear();
const ancienFuseau = process.env.TZ;
process.env.TZ = 'UTC';
const changementFuseau = new PosteJournal(save, new Date('2026-08-30T15:00:00Z'), 0);
process.env.TZ = 'Pacific/Kiritimati';
changementFuseau.avancer(new Date('2026-08-30T15:00:30Z'), 30000);
assert.equal([...saved.values()][0].fin_local, '2026-08-30T15:00:00');
assert.equal([...saved.values()][0].fermeture_estimee, true);
assert.equal([...saved.values()][1].date_jour, '2026-08-31');
if (ancienFuseau === undefined) delete process.env.TZ;
else process.env.TZ = ancienFuseau;
console.log('Suivi poste : connexion, deconnexion, minuit, crash, horloge, fuseau, veille et heure hors ligne OK');
