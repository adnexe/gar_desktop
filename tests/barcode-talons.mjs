import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const barcode = readFileSync('src/Components/BarcodeCode128.vue', 'utf8');
assert.ok(barcode.includes("format: 'CODE128'"));
assert.ok(barcode.includes('displayValue: false'));
assert.ok(barcode.includes('marginLeft: 13') && barcode.includes('marginRight: 13'), 'Zones blanches pour le scanner');
assert.ok(barcode.includes('max-width: 100%'));
assert.ok(barcode.includes("lineColor: '#000000'"));
assert.ok(barcode.includes("background: '#ffffff'"));

const bagage = readFileSync('src/Components/bagage/BagageRecu.vue', 'utf8');
const courrier = readFileSync('src/Components/courrier/CourrierRecu.vue', 'utf8');
assert.equal((bagage.match(/<BarcodeCode128/g) ?? []).length, 1);
assert.equal((courrier.match(/<BarcodeCode128/g) ?? []).length, 1);
assert.ok(bagage.indexOf('<BarcodeCode128') > bagage.indexOf('v-if="mode !== \'recu\'"'));
assert.ok(courrier.indexOf('<BarcodeCode128') > courrier.indexOf("(partie ?? 'tout') !== 'recu'"));
assert.ok(bagage.includes(':valeur="recu.numero_bagage"'));
assert.ok(courrier.includes(':valeur="recu.numero_courrier"'));

console.log('Codes-barres talons : Code 128, numeros bagage/courrier, SVG adaptable et fallback lisible OK');
