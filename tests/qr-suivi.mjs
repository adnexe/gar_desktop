import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { construireLienSuiviDepuisPoste, construireLienSuiviPublic } from '../src/lib/suiviPublic.ts';

const uuid = 'fdb2a181-b75a-42f6-b347-1df01494db6e';
assert.equal(
    construireLienSuiviPublic('https://admin.exemple.com///', 'courrier', 'ADJ 003/01', uuid),
    `https://admin.exemple.com/suivi/courrier/ADJ%20003%2F01?cle=${uuid}`,
);
assert.equal(construireLienSuiviPublic('', 'ticket', 'ADJ001', uuid), null);
assert.equal(construireLienSuiviPublic('https://admin.test', 'ticket', '', uuid), null);
globalThis.window = { api: { config: { adresseAdmin: async () => 'https://poste.test/' } } };
assert.equal(
    await construireLienSuiviDepuisPoste('bagage', 'ADJ002000001', uuid),
    `https://poste.test/suivi/bagage/ADJ002000001?cle=${uuid}`,
);

for (const fichier of [
    'src/Components/courrier/CourrierRecu.vue',
    'src/Components/bagage/BagageRecu.vue',
    'src/Components/vente/TicketRecu.vue',
]) {
    const source = readFileSync(fichier, 'utf8');
    assert.equal((source.match(/<QrCodeSuivi/g) ?? []).length, 2, `${fichier} doit afficher un QR sur le reçu et le talon`);
}

for (const [fichier, type] of [
    ['src/Components/courrier/CourrierForm.vue', "'courrier'"],
    ['src/Components/courrier-international/CourrierInternationalForm.vue', "'courrier-international'"],
    ['src/Components/bagage/BagageForm.vue', "'bagage'"],
    ['src/Components/vente/VenteForm.vue', "'ticket'"],
]) {
    const source = readFileSync(fichier, 'utf8');
    assert.ok(source.includes(`construireLienSuiviDepuisPoste(${type}`), `${fichier} doit relire l'adresse locale avant de construire son lien public`);
}

const css = readFileSync('src/assets/app.css', 'utf8');
assert.match(css, /--impression-garde-laterale:\s*4mm/);
assert.match(css, /\.zone-impression \.ticket-recu \.qr-suivi svg/);

console.log('QR de suivi: URLs, reçus et talons vérifiés.');
