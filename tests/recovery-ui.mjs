import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { parse, compileScript } from '@vue/compiler-sfc';
import { createSSRApp, defineComponent, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const { descriptor } = parse(readFileSync('src/Components/RecupererVentesButton.vue', 'utf8'));
const compiled = compileScript(descriptor, { id: 'test-recovery', inlineTemplate: true });
const stub = defineComponent({ setup(_, { slots }) { return () => h('span', slots.default?.()); } });
const session = { role: 'super_admin', userId: 1, agenceId: 1 };
const exports = {};
vm.runInNewContext(ts.transpileModule(compiled.content, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports,
    require: name => {
        if (name === 'vue') return require('vue');
        if (name === '@/Stores/session') return { useSessionStore: () => session };
        if (name === '@/Stores/config') return { useConfigStore: () => ({ agence: { nom: 'Adjame' } }) };
        return new Proxy({ default: stub }, { get: (object, key) => key === '__esModule' ? true : object[key] ?? stub });
    },
});
for (const section of ['ticket', 'bagage', 'courrier', 'courrier_international']) {
    const props = { section, date: '2026-08-31' };
    session.role = 'super_admin';
    const html = await renderToString(createSSRApp(exports.default, props));
    assert.ok(html.includes('Récupérer les ventes') && html.includes('mot de passe super administrateur'));
    for (const role of ['agent', 'chef_gare', 'admin']) {
        session.role = role;
        const hidden = await renderToString(createSSRApp(exports.default, props));
        assert.ok(!hidden.includes('Récupérer les ventes'), `${role} ne voit pas le bouton ${section}`);
    }
}
for (const [page, section] of [['Vente', 'ticket'], ['Bagages', 'bagage'], ['Courrier', 'courrier'], ['CourrierInternational', 'courrier_international']]) {
    const source = readFileSync(`src/Views/${page}.vue`, 'utf8');
    assert.ok(source.includes(`<RecupererVentesButton section="${section}" :date="dateFiltre"`));
}
console.log('Recuperation UI : bouton superadmin uniquement, 4 sections et date du filtre OK');
