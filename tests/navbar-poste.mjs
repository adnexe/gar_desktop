import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { parse, compileScript } from '@vue/compiler-sfc';
import { createSSRApp, defineComponent, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = readFileSync('src/Components/AppSidebarHeader.vue', 'utf8');
const { descriptor } = parse(source);
const compiled = compileScript(descriptor, { id: 'test-navbar-poste', inlineTemplate: true });
const code = ts.transpileModule(compiled.content, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const stub = defineComponent({ setup(_, { slots }) { return () => h('span', slots.default?.()); } });
const config = {
    licence: { code_poste: '004', date_expiration: '2099-12-31', actif: true, statut: 'assignee' },
    agence: { nom: 'Gare Adjame', ville_nom: 'Abidjan' },
};
const exports = {};
vm.runInNewContext(code, {
    exports, Date, Intl, setTimeout,
    require: (name) => {
        if (name === 'vue') return require('vue');
        if (name === '@/Stores/config') return { useConfigStore: () => config };
        return new Proxy({ default: stub }, { get: (object, key) => key === '__esModule' ? true : object[key] ?? stub });
    },
});

const render = () => renderToString(createSSRApp(exports.default, { titre: 'Vente de tickets' }));
const html = await render();
assert.ok(html.includes('Poste 004'), 'Le numero vient de la licence locale et conserve les zeros');
assert.ok(html.includes('Numéro de ce poste'));
assert.ok(html.includes('Vente de tickets') && html.includes('Gare Adjame') && html.includes('Synchroniser'));
assert.ok(html.includes('flex-wrap') && !html.includes('flex h-[68px]'), 'La barre peut revenir a la ligne');
config.licence.code_poste = null;
assert.ok(!(await render()).includes('Numéro de ce poste'), 'Aucun numero invente si la licence ne le fournit pas');
config.licence = null;
assert.ok(!(await render()).includes('Numéro de ce poste'), 'Affichage sans licence supporte');
console.log('Navbar desktop : numero de poste local, controles existants et absence de licence OK');
