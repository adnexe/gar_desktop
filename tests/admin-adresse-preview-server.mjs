// Apercu isole : pas de base reelle, pas d'appel admin ni d'impression.
import { createServer } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwind from '@tailwindcss/vite';
import { resolve } from 'node:path';

const entry = `
import {createApp,h} from 'vue';
import {createPinia} from 'pinia';
import {createRouter,createWebHashHistory,RouterView} from 'vue-router';
import Configuration from '/src/Views/ConfigurationInitiale.vue';
import Parametres from '/src/Views/Parametres.vue';
import {useSessionStore} from '/src/Stores/session';
import '/src/assets/app.css';
const params=new URLSearchParams(location.search);
const initial=params.has('initial');
let url='https://admin.exemple.com';
const agence={id:1,uuid:'test',reference:'AG-TEST',nom:'Gare Adjame',ville_nom:'Abidjan'};
const licence={code_poste:'004',date_debut:'2026-01-01',date_expiration:'2099-12-31',actif:true,statut:'assignee'};
window.api={
 config:{estConfiguree:async()=>!initial,agenceActuelle:async()=>agence,licenceActuelle:async()=>licence,compagnieActuelle:async()=>({nom:'Adnexe Transport',modules_actifs:['ticket','bagage','courrier']}),
 adresseAdmin:async()=>url,
 enregistrerAdresseAdmin:async(value)=>{await new Promise(r=>setTimeout(r,800));if(value.includes('absent'))throw new Error('Impossible de joindre admin. Adresse non modifiee.');url=value.replace(/\\/+$/,'');return url;},
 reclamerLicence:async()=>({ok:true,message:'Licence disponible',licence}),configurer:async()=>agence,
 reseauLocal:async()=>({mode:'autonome',serveurUrl:null,port:3750,secret:null,actif:false,adresses:[],agence:'Gare Adjame'}),
 calibrationImpression:async()=>({largeurPapierMm:80,largeurContenuMm:76,decalageXMm:0}),envoisRefuses:async()=>({operations:[]})},
 miseAJour:{surMiseAJourPrete:()=>()=>{}},impression:{listerImprimantes:async()=>[]},
 auth:{verifierSession:async()=>({ok:true})}
};
const pinia=createPinia();
useSessionStore(pinia).definir({userId:1,uuid:'test',nom:'Compte test',role:params.has('agent')?'agent':'super_admin',agentId:null,agenceId:1,typeAgent:['ticket','bagage','courrier']});
const names=['configuration','profil','dashboard','vente','bagages','courrier','courrier-international','voyages','tarifs','vehicules','chauffeurs','agents','historique','parametres','connexion','licence'];
const router=createRouter({history:createWebHashHistory(),routes:[{path:'/',component:initial?Configuration:Parametres},...names.map(name=>({path:'/'+name,name,component:name==='configuration'?Configuration:Parametres}))]});
createApp({render:()=>h(RouterView)}).use(pinia).use(router).mount('#app');
`;
const server = await createServer({
    configFile: false, cacheDir: 'node_modules/.vite-admin-adresse-preview',
    plugins: [vue(), tailwind(), {
        name: 'admin-adresse-preview',
        resolveId(id) { if (id === '/admin-adresse-preview.js') return '\0admin-adresse-preview'; },
        load(id) { if (id === '\0admin-adresse-preview') return entry; },
        configureServer(server) {
            server.middlewares.use((req, res, next) => {
                if (req.url.split('?')[0] === '/') {
                    res.setHeader('Content-Type', 'text/html; charset=utf-8');
                    res.end('<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Adresse admin - test isole</title></head><body><div id="app"></div><script type="module" src="/admin-adresse-preview.js"></script></body></html>');
                    return;
                }
                next();
            });
        },
    }],
    resolve: { alias: { '@': resolve('src') } },
    server: { host: '127.0.0.1', port: 5193, strictPort: true },
});
await server.listen();
console.log('Adresse admin, test isole : http://127.0.0.1:5193/?initial');
