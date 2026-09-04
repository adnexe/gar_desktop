// Apercu isole : aucune base locale, vente, synchronisation ou impression.
import { createServer } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'node:path';

const entry = `
import {createApp,h} from 'vue';
import BagageRecu from '/src/Components/bagage/BagageRecu.vue';
import CourrierRecu from '/src/Components/courrier/CourrierRecu.vue';
import TicketRecu from '/src/Components/vente/TicketRecu.vue';
import '/src/assets/app.css';
const params=new URLSearchParams(location.search);
const papier=Number(params.get('papier'))||80;
const contenu=Number(params.get('contenu'))||76;
const decalage=Number(params.get('decalage'))||0;
document.documentElement.style.setProperty('--impression-largeur-papier',papier+'mm');
document.documentElement.style.setProperty('--impression-largeur-contenu',contenu+'mm');
document.documentElement.style.setProperty('--impression-decalage-x',decalage+'mm');
const compagnie={nom:'Adnexe Transport',telephone:'0102030405',whatsapp:null,site_web:null,pied_ticket:null};
const bagage={uuid:'11111111-1111-4111-8111-111111111111',suivi_url:'https://admin.exemple.com/suivi/bagage/ADJ002000001?cle=11111111-1111-4111-8111-111111111111',numero_bagage:'ADJ002000001',numero_ticket:'ADJ001000042',numero_place:6,reference:'',destination:'Bouake',voyage:'02/09/2026 08:30',client:'Awa Kone',client_telephone:'0101010101',valeur:15000,montant:3000,description:'Deux sacs de voyage',agence:'Gare Adjame',agent:'Koffi',created_at:'02/09/2026 09:10',compagnie};
const courrier={uuid:'22222222-2222-4222-8222-222222222222',suivi_url:'https://admin.exemple.com/suivi/courrier/ADJ003000001?cle=22222222-2222-4222-8222-222222222222',numero_courrier:'ADJ003000001',destination:'Daloa',agence_arrivee:'Agence Daloa',agence_arrivee_telephone:'0202020202',voyage:'02/09/2026 10:00',expediteur:'',expediteur_nom:'Fatou',expediteur_telephone:'0303030303',destinataire:'',destinataire_nom:'Yao',destinataire_telephone:'0404040404',colis:[{nom:'Documents',type:'Petit',quantite:1,montant:2000}],prix_expedition:1000,montant_colis:2000,montant_total:3000,agence_depart:'Gare Adjame',agence_depart_telephone:'0102030405',agent:'Koffi',created_at:'02/09/2026 09:15',compagnie};
const ticket={uuid:'33333333-3333-4333-8333-333333333333',suivi_url:'https://admin.exemple.com/suivi/ticket/ADJ001000042?cle=33333333-3333-4333-8333-333333333333',numero:'ADJ001000042',numero_place:6,type_billet:'aller',tarification:'ordinaire',montant:5000,timbre:100,total:5100,created_at:'02/09/2026 09:00',agence:'Gare Adjame',agence_telephone:'0102030405',ville_depart:'Abidjan',ville_arrivee:'Une destination avec un nom très long',date_depart:'02/09/2026',heure_depart:'08:30',vehicule:'AB-123-CD',client:'Un nom de client volontairement très long pour contrôler le retour à la ligne',vendeur:'Koffi',compagnie};
createApp({render:()=>h('main',{class:'zone-impression apercu'},[
 h(BagageRecu,{recu:bagage,mode:'recu'}),h(BagageRecu,{recu:bagage,mode:'talon'}),
 h(CourrierRecu,{recu:courrier,partie:'recu'}),h(CourrierRecu,{recu:courrier,partie:'etiquette'}),
 h(TicketRecu,{recu:ticket,partie:'ticket'}),h(TicketRecu,{recu:ticket,partie:'talon'})
])}).mount('#app');
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
                if (req.url?.split('?')[0] === '/') {
                    res.setHeader('Content-Type', 'text/html; charset=utf-8');
                    res.end('<!doctype html><html><head><meta charset="utf-8"><style>body{background:#eee;margin:0}.apercu{display:flex!important;align-items:flex-start;flex-wrap:wrap;gap:24px;padding:24px;width:auto!important;overflow:visible!important}.ticket-recu{background:#fff;box-shadow:0 1px 5px #999}</style></head><body><div id="app"></div><script type="module" src="/barcode-preview.js"></script></body></html>');
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
