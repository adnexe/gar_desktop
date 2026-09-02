import assert from 'node:assert/strict';
import { creerProtectionChargement, insererEnTeteSansDoublon } from '../src/lib/listeTransactions.ts';

const initiale = [
    { uuid: 'vente-ancienne', montant: 1000 },
    { uuid: 'vente-remplacee', montant: 1500 },
];

assert.deepEqual(
    insererEnTeteSansDoublon(initiale, { uuid: 'vente-nouvelle', montant: 2000 }),
    [
        { uuid: 'vente-nouvelle', montant: 2000 },
        { uuid: 'vente-ancienne', montant: 1000 },
        { uuid: 'vente-remplacee', montant: 1500 },
    ],
);

assert.deepEqual(
    insererEnTeteSansDoublon(initiale, { uuid: 'vente-remplacee', montant: 2500 }),
    [
        { uuid: 'vente-remplacee', montant: 2500 },
        { uuid: 'vente-ancienne', montant: 1000 },
    ],
);

const protection = creerProtectionChargement();
const ancienChargement = protection.commencer();
protection.invalider();
assert.equal(protection.estCourant(ancienChargement), false);

const dernierChargement = protection.commencer();
assert.equal(protection.estCourant(dernierChargement), true);

let listeAffichee = [{ uuid: 'vente-existante', montant: 1000 }];
const chargementLent = protection.commencer();
protection.invalider();
listeAffichee = insererEnTeteSansDoublon(listeAffichee, { uuid: 'premiere-vente', montant: 3000 });

// Une ancienne lecture SQLite qui termine après la vente ne doit plus pouvoir
// remettre l'écran dans son état précédent.
if (protection.estCourant(chargementLent)) {
    listeAffichee = [{ uuid: 'vente-existante', montant: 1000 }];
}

assert.deepEqual(listeAffichee, [
    { uuid: 'premiere-vente', montant: 3000 },
    { uuid: 'vente-existante', montant: 1000 },
]);

console.log('OK - les nouvelles ventes restent visibles et les chargements obsolètes sont ignorés.');
