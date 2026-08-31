import assert from 'node:assert/strict';

process.env.TZ = 'Asia/Bangkok';

const { dateCaisseDuJour, formatDateHeure, maintenantCaisseIso } = await import('../electron/database/dates.ts');

// Avec TZ=Asia/Bangkok, 23:03 UTC s'affiche 06:03 le lendemain. La caisse
// doit conserver ce 23/08 affiché comme journée métier d'Abidjan, sans le
// reclasser au 22/08 dans les rapports.
const heureAfficheeA0603 = new Date('2026-08-22T23:03:00.000Z');

assert.equal(dateCaisseDuJour(heureAfficheeA0603), '2026-08-23');
assert.equal(maintenantCaisseIso(heureAfficheeA0603), '2026-08-23T06:03:00.000Z');
assert.equal(formatDateHeure('2026-08-23T06:03:00.000Z'), '23/08/2026 06:03');

console.log('OK - la vente reste dans la journée de caisse affichée, même avec un poste en UTC+7.');
