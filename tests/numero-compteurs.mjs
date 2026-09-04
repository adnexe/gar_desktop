import assert from 'node:assert/strict';
import {
    appliquerCompteursOperationsServeur,
    genererNumeroBagage,
    genererNumeroCourrier,
    genererNumeroCourrierInternational,
    genererNumeroLot,
    genererNumeroTicket,
    genererReferenceConvoi,
    prevoirNumeroTicket,
} from '../electron/database/numero.ts';

class FakeDatabase {
    config = new Map();
    tables = new Map([
        ['tickets', []], ['bagages', []], ['courriers', []],
        ['courriers_internationaux', []], ['lots_bordereaux', []], ['convois', []],
    ]);

    ajouter(table, colonne, valeur) {
        this.tables.get(table).push({ [colonne]: valeur });
    }

    prepare(sql) {
        if (sql.startsWith('SELECT valeur FROM config')) {
            return { get: (cle) => this.config.has(cle) ? { valeur: this.config.get(cle) } : undefined };
        }
        if (sql.startsWith('INSERT INTO config')) {
            return { run: (cle, valeur) => { this.config.set(cle, valeur); } };
        }
        if (sql.includes('SELECT MAX(CAST(substr(')) {
            const colonne = sql.match(/substr\((\w+),/)[1];
            const table = sql.match(/FROM (\w+)/)[1];
            return {
                get: (_debut, _longueur, prefixe) => {
                    const motif = new RegExp(`^${prefixe.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\d{6}$`);
                    const max = this.tables.get(table)
                        .map((ligne) => ligne[colonne])
                        .filter((valeur) => motif.test(valeur))
                        .reduce((courant, valeur) => Math.max(courant, Number.parseInt(valeur.slice(prefixe.length), 10)), 0);
                    return { max };
                },
            };
        }
        if (sql.startsWith('SELECT 1 FROM ')) {
            const [, table, colonne] = sql.match(/^SELECT 1 FROM (\w+) WHERE (\w+) =/);
            return { get: (valeur) => this.tables.get(table).some((ligne) => ligne[colonne] === valeur) ? { existe: 1 } : undefined };
        }
        throw new Error(`Requête non simulée: ${sql}`);
    }
}

const compteurs = {
    prefixe: 'ADJ002', ticket: 154, bagage: 45, courrier: 32,
    courrier_international: 66, lot_courrier: 12, lot_bagage: 7,
    lot_courrier_international: 4, convoi: 89,
};

{
    const db = new FakeDatabase();
    db.ajouter('tickets', 'numero_ticket', 'ADJ002000160');
    db.config.set('courrier_sequence_ADJ002', '40');
    const retenus = appliquerCompteursOperationsServeur(db, compteurs, '2', 'ADJ');
    assert.equal(retenus.ticket, 160, 'le compteur local plus avancé ne doit jamais reculer');
    assert.equal(retenus.courrier, 40, 'la configuration locale plus avancée doit être conservée');
    assert.equal(genererNumeroTicket(db, '002', 'ADJ'), 'ADJ002000161');
    assert.equal(genererNumeroBagage(db, '002', 'ADJ'), 'ADJ002000046');
    assert.equal(genererNumeroCourrier(db, '002', 'ADJ'), 'ADJ002000041');
    assert.equal(genererNumeroCourrierInternational(db, '002', 'ADJ'), 'ADJ002000067');
    assert.deepEqual(genererNumeroLot(db, 'courrier', '002', 'ADJ'), { numeroLot: 13, reference: 'BE-ADJ002000013' });
    assert.deepEqual(genererNumeroLot(db, 'bagage', '002', 'ADJ'), { numeroLot: 8, reference: 'BB-ADJ002000008' });
    assert.equal(genererReferenceConvoi(db, '002', 'ADJ'), 'CNV-ADJ002000090');
}

{
    const db = new FakeDatabase();
    appliquerCompteursOperationsServeur(db, compteurs, '002', 'ADJ');
    assert.equal(prevoirNumeroTicket(db, '002', 'ADJ'), 'ADJ002000155');
    assert.equal(genererNumeroTicket(db, '002', 'ADJ'), 'ADJ002000155', 'une base réinstallée doit reprendre après l’admin');
    assert.equal(genererNumeroTicket(db, '002', 'ADJ', 'ADJ002000120'), 'ADJ002000156', 'un ancien numéro préparé ne doit pas faire reculer le compteur');
    assert.throws(() => genererNumeroTicket(db, null, 'ADJ'), /NUMEROTATION_POSTE_NON_CONFIGUREE/);
    assert.throws(() => prevoirNumeroTicket(db, '002', null), /NUMEROTATION_POSTE_NON_CONFIGUREE/);
    assert.throws(
        () => appliquerCompteursOperationsServeur(db, { ...compteurs, prefixe: 'ADJ003' }, '002', 'ADJ'),
        /COMPTEURS_PREFIXE_INCOHERENT/,
    );
}

console.log('Compteurs Desktop: reprise serveur, monotonie et formats validés.');
