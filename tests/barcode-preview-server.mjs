// Apercu isole : aucune base locale, vente, synchronisation ou impression.
import { createServer } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'node:path';

const entry = `
import {createApp,h} from 'vue';
import BagageRecu from '/src/Components/bagage/BagageRecu.vue';
import CourrierRecu from '/src/Components/courrier/CourrierRecu.vue';
import '/src/assets/app.css';
const compagnie={nom:'Adnexe Transport',telephone:'0102030405',whatsapp:null,site_web:null,pied_ticket:null};
const bagage={numero_bagage:'ADJ002000001',numero_ticket:'ADJ001000042',numero_place:6,reference:'',destination:'Bouake',voyage:'02/09/2026 08:30',client:'Awa Kone',client_telephone:'0101010101',valeur:15000,montant:3000,description:'Deux sacs de voyage',agence:'Gare Adjame',agent:'Koffi',created_at:'02/09/2026 09:10',compagnie};
const courrier={numero_courrier:'ADJ003000001',destination:'Daloa',agence_arrivee:'Agence Daloa',agence_arrivee_telephone:'0202020202',voyage:'02/09/2026 10:00',expediteur:'',expediteur_nom:'Fatou',expediteur_telephone:'0303030303',destinataire:'',destinataire_nom:'Yao',destinataire_telephone:'0404040404',colis:[{nom:'Documents',type:'Petit',quantite:1,montant:2000}],prix_expedition:1000,montant_colis:2000,montant_total:3000,agence_depart:'Gare Adjame',agence_depart_telephone:'0102030405',agent:'Koffi',created_at:'02/09/2026 09:15',compagnie};
createApp({render:()=>h('main',{class:'apercu'},[h(BagageRecu,{recu:bagage,mode:'talon'}),h(CourrierRecu,{recu:courrier,partie:'etiquette'})])}).mount('#app');
`;

const server = await createServer({
    configFile: false,
    cacheDir: 'node_modules/.vite-barcode-preview',
    plugins: [vue(), {
        name: 'barcode-preview',
        resolveId(id) { if (id === '/barcode-preview.js') return '\0barcode-preview'; },
        load(id) { if (id === '\0barcode-preview') return entry; },
        configureServer(server) {
            server.middlewares.use((req, res, next) => {
                if (req.url === '/') {
                    res.setHeader('Content-Type', 'text/html; charset=utf-8');
                    res.end('<!doctype html><html><head><meta charset="utf-8"><style>body{background:#eee;margin:0}.apercu{display:flex;align-items:flex-start;gap:24px;padding:24px}.ticket-recu{background:#fff;padding:8px!important;box-shadow:0 1px 5px #999}</style></head><body><div id="app"></div><script type="module" src="/barcode-preview.js"></script></body></html>');
                    return;
                }
                next();
            });
        },
    }],
    resolve: { alias: { '@': resolve('src') } },
    server: { host: '127.0.0.1', port: 5194, strictPort: true },
});
await server.listen();
console.log('Talons codes-barres, test isole : http://127.0.0.1:5194/');
