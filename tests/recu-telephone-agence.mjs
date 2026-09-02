import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ticket = readFileSync('src/Components/vente/TicketRecu.vue', 'utf8');
const bagage = readFileSync('src/Components/bagage/BagageRecu.vue', 'utf8');
const courrier = readFileSync('src/Components/courrier/CourrierRecu.vue', 'utf8');
const venteService = readFileSync('electron/services/VenteService.ts', 'utf8');
const ticketRepository = readFileSync('electron/repositories/TicketRepository.ts', 'utf8');
const bagageRepository = readFileSync('electron/repositories/BagageRepository.ts', 'utf8');

assert.ok(ticket.includes("recu.agence_telephone ? 'Tél agence' : 'Tél compagnie'"));
assert.ok(bagage.includes("recu.agence_telephone ? 'Tél agence' : 'Tél compagnie'"));
assert.ok(courrier.includes("recu.agence_depart_telephone ? 'Tél agence' : 'Tél compagnie'"));
assert.ok(ticket.includes('recu.agence_telephone || recu.compagnie?.telephone'));
assert.ok(bagage.includes('recu.agence_telephone || recu.compagnie?.telephone'));
assert.ok(courrier.includes('recu.agence_depart_telephone || recu.compagnie?.telephone'));

for (const recu of [ticket, bagage, courrier]) {
    assert.equal(recu.includes('Tél : {{ recu.compagnie.telephone }}'), false);
}

assert.ok(ticketRepository.includes('a.telephone AS agence_telephone'));
assert.ok(venteService.includes('agence_telephone: d.agence_telephone'));
assert.ok(bagageRepository.includes('ag.telephone AS agence_telephone'));

console.log('OK - les reçus utilisent le téléphone de la gare, avec celui de la compagnie en secours.');
