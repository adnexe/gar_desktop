// Test visuel uniquement : faux lots et interception de window.print.
import { createServer } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwind from '@tailwindcss/vite';
import { resolve } from 'node:path';

const entry = `
import {createApp,h,ref} from 'vue';
import {createPinia} from 'pinia';
import GestionLotsDialog from '/src/Components/lots/GestionLotsDialog.vue';
import {agence,bagages,compagnie,courriers,lots} from '/tests/bordereaux-fixtures.mjs';
import baseCss from '/src/assets/app.css?inline';
import posCss from '/src/assets/bordereaux-pos.css?inline';
import '/src/assets/app.css';
const type=new URLSearchParams(location.search).get('type')||'courrier';
const papier=Number(new URLSearchParams(location.search).get('papier'))||80;
document.documentElement.style.setProperty('--impression-largeur-papier',papier+'mm');
document.documentElement.style.setProperty('--impression-largeur-contenu',(papier-4)+'mm');
const result=data=>({ok:true,data});
const source=type==='bagage'?bagages:courriers;
const eligibles=source.map((element,index)=>({
 uuid:element.uuid,
 numero:type==='bagage'?element.numero_bagage:element.numero_courrier,
 destination:index===2?'Daloa':'Bouake',
 voyage_uuid:index===2?'voyage-2':'voyage-1',
 voyage:index===2?'Abidjan - Daloa, 09:30':'Abidjan - Bouake, 08:30',
 groupe:index===2?'daloa-voyage-2':'bouake-voyage-1',
 principal:type==='bagage'?element.client:element.destinataire_nom,
 telephone:type==='bagage'?element.client_telephone:element.destinataire_telephone,
 contenu:type==='bagage'?element.description:element.colis.map(c=>c.nom).join(', '),
 montant:type==='bagage'?element.montant:element.montant_total,
}));
window.api={config:{estConfiguree:async()=>true,agenceActuelle:async()=>agence,compagnieActuelle:async()=>compagnie,licenceActuelle:async()=>null},lots:{lister:async()=>result(lots.map(l=>({...l,type}))),eligibles:async()=>result(eligibles),details:async(uuid)=>result({...lots.find(l=>l.uuid===uuid),type}),creer:async()=>result({...lots[0],type})}};
let impressions=0;
window.print=()=>{
 const zone=document.querySelector('.zone-impression-a4');
 const regles=document.querySelector('style[data-impression-a4]').textContent;
 const pos=!!zone.querySelector('.bordereau-pos');
 const iframe=document.querySelector('#document-imprime');
 iframe.style.width=(pos?papier:210)+'mm';
 iframe.srcdoc='<html><head><meta charset="utf-8"><style>'+[baseCss,posCss,regles].join('\\n').replaceAll('@media print','@media all')+'</style></head><body class="impression-a4-active">'+zone.outerHTML+'</body></html>';
 document.querySelector('#compteur').textContent='Dialogues demandés : '+(++impressions)+' ; format '+(pos?'POS':'A4');
 document.querySelector('#apercu').hidden=false;
};
createApp({setup(){const open=ref(false);return()=>h('main',[
 h('button',{onClick:()=>open.value=true},'Bordereaux de test'),
 h(GestionLotsDialog,{open:open.value,'onUpdate:open':v=>open.value=v,type,date:'2026-08-31',agenceId:1,userId:1})
]);}}).use(createPinia()).mount('#app');
`;
const server = await createServer({
    configFile: false,
    cacheDir: 'node_modules/.vite-bordereaux-preview',
    plugins: [vue(), tailwind(), {
        name: 'bordereaux-preview',
        resolveId(id) { if (id === '/bordereaux-preview.js') return '\0bordereaux-preview'; },
        load(id) { if (id === '\0bordereaux-preview') return entry; },
        configureServer(server) {
            server.middlewares.use((req, res, next) => {
                if (req.url?.split('?')[0] === '/') {
                    res.setHeader('Content-Type', 'text/html; charset=utf-8');
                    res.end('<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Bordereaux - test isole</title></head><body><div id="app"></div><section id="apercu" hidden><p id="compteur"></p><iframe title="Document imprimé" id="document-imprime" style="height:1800px;border:1px solid #ddd"></iframe></section><script type="module" src="/bordereaux-preview.js"></script></body></html>');
                    return;
                }
                next();
            });
        },
    }],
    resolve: { alias: { '@': resolve('src') } },
    server: { host: '127.0.0.1', port: 5192, strictPort: true },
});
await server.listen();
console.log('Bordereaux isoles : http://127.0.0.1:5192');
