import assert from 'node:assert/strict';
import { resoudreSelectionScanner } from '../src/lib/selectionLotScanner.ts';

const elements = [
    { uuid: 'courrier-1', numero: 'ADJ003000001', groupe: 'bouake-voyage-1' },
    { uuid: 'courrier-2', numero: 'ADJ003000002', groupe: 'bouake-voyage-1' },
    { uuid: 'courrier-3', numero: 'ADJ003000003', groupe: 'daloa-voyage-2' },
];

assert.deepEqual(
    resoudreSelectionScanner(' adj003000001 ', elements, [], ''),
    { statut: 'selectionne', element: elements[0] },
    'Le premier scan doit accepter le numero sans tenir compte de la casse.',
);

assert.equal(
    resoudreSelectionScanner('ADJ003000002', elements, ['courrier-1'], 'bouake-voyage-1').statut,
    'selectionne',
    'Un second envoi du meme voyage doit etre selectionnable.',
);

assert.equal(
    resoudreSelectionScanner('ADJ003000001', elements, ['courrier-1'], 'bouake-voyage-1').statut,
    'deja_selectionne',
    'Un double scan ne doit pas creer de doublon.',
);

assert.equal(
    resoudreSelectionScanner('ADJ003000003', elements, ['courrier-1'], 'bouake-voyage-1').statut,
    'autre_groupe',
    'Un lot ne doit pas melanger les voyages ou destinations.',
);

assert.deepEqual(
    resoudreSelectionScanner('INCONNU', elements, [], ''),
    { statut: 'introuvable', numero: 'INCONNU' },
    'Un numero absent ou deja affecte doit etre refuse.',
);

assert.equal(resoudreSelectionScanner('   ', elements, [], '').statut, 'vide');

console.log('OK - sélection des lots par code-barres, doublons et groupes vérifiés.');
