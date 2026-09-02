import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import { parse, compileScript } from '@vue/compiler-sfc';
import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { agence, compagnie, courriers, bagages, lots } from './bordereaux-fixtures.mjs';

const require = createRequire(import.meta.url);
function composant(path) {
    const { descriptor } = parse(readFileSync(path, 'utf8'));
    const script = compileScript(descriptor, { id: 'test-formats', inlineTemplate: true });
    const exports = {};
    vm.runInNewContext(ts.transpileModule(script.content, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, require, Intl });
    return exports.default;
}
const bordereau = composant('src/Components/BordereauA4.vue');
const etat = composant('src/Components/lots/EtatLotsA4.vue');
for (const type of ['courrier', 'courrier_international', 'bagage']) {
    for (const format of ['a4', 'pos']) {
        const html = await renderToString(createSSRApp(bordereau, { type, format, date: '2026-08-31', agence, compagnie, courriers, bagages, numeroLot: 45, referenceLot: 'BE-ADJ004000045', voyage: 'Depart 08:30' }));
        assert.equal(html.includes('<table'), format === 'a4');
        assert.equal(html.includes('bordereau-pos-element'), format === 'pos');
        for (const numero of ['ADJ004000001', 'ADJ004000002', 'ADJ004000003']) assert.ok(html.includes(numero));
        for (const contenu of [compagnie.nom, 'LOT N° 45', 'BE-ADJ004000045', '31/08/2026', 'Depart 08:30', '9\u202f000 FCFA']) assert.ok(html.includes(contenu), `${format}: ${contenu}`);
        assert.ok(html.includes(type === 'bagage' ? 'ADJ004000051' : '0707070707'));
        assert.ok(html.includes(type === 'bagage' ? 'Grand sac' : 'Document accompagne'));
        assert.ok(!html.includes('<img'), 'Pas de logo invente');
        const synthese = await renderToString(createSSRApp(etat, { type, format, date: '2026-08-31', agence, compagnie, lots }));
        assert.equal(synthese.includes('<table'), format === 'a4');
        for (const contenu of ['BE-ADJ004000001', 'BE-ADJ004000002', 'Awa Kone', 'En préparation', '18\u202f000 FCFA', '6 élément(s)']) assert.ok(synthese.includes(contenu));
    }
}

const vars = new Map();
const styles = [];
const classes = new Set();
let height = 800, printed = [], failPrint = false, hasZone = true;
const zone = { style: { cssText: 'initial' }, scrollHeight: height, getBoundingClientRect: () => ({ height }) };
const document = {
    documentElement: {},
    querySelector: () => hasZone ? zone : null,
    createElement: () => { const style = { dataset: {}, textContent: '', remove: () => styles.splice(styles.indexOf(style), 1) }; return style; },
    head: { appendChild: style => styles.push(style) },
    body: { classList: { add: name => classes.add(name), remove: name => classes.delete(name) } },
};
const exports = {};
vm.runInNewContext(ts.transpileModule(readFileSync('src/lib/impressionA4.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, Error, document, getComputedStyle: () => ({ getPropertyValue: name => vars.get(name) ?? '' }),
    requestAnimationFrame: callback => callback(), require: name => { assert.equal(name, '@/assets/bordereaux-pos.css'); return {}; },
    window: { print: () => { assert.ok(classes.has('impression-a4-active')); printed.push(styles[0].textContent); if (failPrint) throw new Error('Printer dialog failed'); } },
});
await exports.imprimerBordereau('a4');
const styleA4 = printed.pop();
assert.ok(styleA4.includes('size: 210mm 297mm; margin: 10mm'));
assert.match(styleA4, /width: 190mm !important/);
assert.match(styleA4, /\.bordereau-a4:not\(\.bordereau-pos\)/);
assert.equal(styles.length, 0);
await exports.imprimerBordereau('pos');
assert.match(printed.pop(), /size: 80mm 218mm/);
assert.equal(zone.style.cssText, 'initial');
vars.set('--impression-largeur-papier', '58mm');
vars.set('--impression-largeur-contenu', '70mm');
vars.set('--impression-decalage-x', '-4mm');
const dimensions = exports.dimensionsBordereauPos();
assert.equal(dimensions.papier, 58);
assert.equal(dimensions.contenu, 54);
assert.equal(dimensions.gauche, 0);
await exports.imprimerBordereau('pos');
assert.match(printed.pop(), /size: 58mm/);
height = 90000;
await exports.imprimerBordereau('pos');
assert.match(printed.pop(), /58mm 1000mm/);
const first = exports.imprimerBordereau('pos');
await assert.rejects(exports.imprimerBordereau('pos'), /déjà en cours/);
await first;
failPrint = true;
await assert.rejects(exports.imprimerBordereau('pos'), /Printer dialog failed/);
assert.equal(styles.length, 0);
assert.equal(classes.size, 0);
failPrint = false;
await exports.imprimerBordereauA4();
assert.match(printed.pop(), /size: 210mm 297mm/);
hasZone = false;
await assert.rejects(exports.imprimerBordereau('a4'), /Aucun bordereau/);
assert.ok(!readFileSync('src/lib/impressionA4.ts', 'utf8').includes('window.api.impression'));
console.log('Bordereaux : A4/POS, 3 modules, etats, totaux, contenus, 58/80mm, pagination longue, dialogue classique et nettoyage OK');
