import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import { parse, compileScript } from '@vue/compiler-sfc';
import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';

const require = createRequire(import.meta.url);
const { descriptor } = parse(readFileSync('src/Components/convoi/ConvoiRecu.vue', 'utf8'));
const script = compileScript(descriptor, { id: 'convoi-pos-test', inlineTemplate: true });
const exports = {};
vm.runInNewContext(ts.transpileModule(script.content, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, require, Intl });
const component = exports.default;
const convoi = {
  uuid: 'test-convoi', reference: 'CNV-ADJ002000001', agence: 'Gare Adjamé', ville_depart: 'Abidjan',
  destination: 'Bouaké', precision_destination: 'VillageDEssaiAvecUnNomTresLongSansEspaceEtUneAdresseComplete'.repeat(2),
  nombre_places: 200, montant_fixe: 125000, date_depart: '2026-09-05', heure_depart: '08:30',
  date_retour: '2026-09-06', heure_retour: null, statut: 'programme', cree_par: 'Awa Koné',
};
const compagnie = { nom: 'COMPAGNIE DE TRANSPORT DE TEST', telephone: '0101010101' };
const agence = { nom: 'Gare Adjamé', telephone: '0707070707' };
const html = {};
for (const mode of ['bordereau', 'caisse']) {
  html[mode] = await renderToString(createSSRApp(component, { convoi, agence, compagnie, mode }));
  for (const text of ['CNV-ADJ002000001', 'Awa Koné', '05/09/2026', '06/09/2026', '0707070707', 'Bouaké']) assert.ok(html[mode].includes(text), `${mode}: ${text}`);
  assert.ok(!html[mode].includes('0101010101'));
  assert.ok(!html[mode].includes('<img'));
  assert.equal(html[mode].includes('125\u202f000 FCFA'), mode === 'caisse');
  assert.equal(html[mode].includes('<table'), mode === 'bordereau');
}
assert.equal((html.bordereau.match(/<td>\d+<\/td>/g) ?? []).length, 200);
assert.ok(html.bordereau.includes('<td>200</td>'));
const fallback = await renderToString(createSSRApp(component, { convoi, agence: { nom: 'Gare' }, compagnie, mode: 'caisse' }));
assert.ok(fallback.includes('0101010101'));
const view = readFileSync('src/Views/Convois.vue', 'utf8');
assert.ok(!view.includes('imprimerBordereauA4'));
assert.ok(view.includes('window.api.impression.imprimerRecu(hauteurZoneImpressionMm())'));
assert.ok(view.includes('if (!resultat.ok) throw new Error'));
assert.equal((view.match(/await lancerImpressionPos\(\)/g) ?? []).length, 2);
assert.equal((view.match(/if \(impressionUuid.value\) return/g) ?? []).length, 2);

if (process.env.CONVOI_VISUAL_DIR) {
  const dir = process.env.CONVOI_VISUAL_DIR;
  mkdirSync(dir, { recursive: true });
  const css = readFileSync('src/assets/app.css', 'utf8');
  for (const mode of ['bordereau', 'caisse']) {
    writeFileSync(`${dir}/${mode}.html`, `<!doctype html><html><head><meta charset="utf-8"><style>${css}\n${descriptor.styles.map(s => s.content).join('\n')}\n.zone-impression-convoi{overflow:visible!important;clip-path:none!important} body{margin:0} @page{size:80mm 1000mm;margin:0}</style></head><body><div class="zone-impression zone-impression-convoi">${html[mode]}</div></body></html>`);
  }
}
console.log('Convoi POS : contenu, 200 places, montant uniquement sur fin de caisse, telephone de gare, calibrage et IPC commun OK.');
