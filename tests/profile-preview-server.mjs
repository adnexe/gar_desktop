// Apercu isole : aucune connexion a Electron, admin ou une base reelle.
import { createServer } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwind from '@tailwindcss/vite';
import { resolve } from 'node:path';

const entry = `
import {createApp,h} from 'vue';
import {createPinia} from 'pinia';
import {createRouter,createWebHashHistory,RouterView} from 'vue-router';
import Profil from '/src/Views/Profil.vue';
import {useSessionStore} from '/src/Stores/session';
import '/src/assets/app.css';
const agence={id:1,uuid:'test',reference:'AG-TEST',nom:'Gare Adjame',ville_nom:'Abidjan'};
const licence={code_poste:'004',date_expiration:'2099-12-31',actif:true,statut:'assignee'};
window.api={
 config:{estConfiguree:async()=>true,agenceActuelle:async()=>agence,licenceActuelle:async()=>licence,compagnieActuelle:async()=>({nom:'Adnexe Transport',modules_actifs:['ticket','bagage','courrier']})},
 miseAJour:{surMiseAJourPrete:()=>()=>{}},
 auth:{verifierSession:async()=>({ok:true}),profil:async()=>({uuid:'test',nom:'Awa Kone',telephone:'0101010101',email:'awa.kone@example.test',role:'agent',agent_nom:'Awa Kone',type_agent:'ticket,bagage,courrier',agence_nom:'Gare Adjame'}),
 modifierMotDePasse:async(p)=>{await new Promise(r=>setTimeout(r,800));if(p.currentPassword!=='Ancien-test-123')throw new Error('Vérifiez votre mot de passe actuel, le nouveau mot de passe et sa confirmation.');return {ok:true};}}
};
const pinia=createPinia();
useSessionStore(pinia).definir({userId:1,uuid:'test',nom:'Awa Kone',role:'agent',agentId:1,agenceId:1,typeAgent:['ticket','bagage','courrier']});
const names=['profil','dashboard','vente','bagages','courrier','courrier-international','voyages','tarifs','vehicules','chauffeurs','historique','parametres','connexion','licence'];
const router=createRouter({history:createWebHashHistory(),routes:names.map(name=>({path:name==='profil'?'/':'/'+name,name,component:Profil}))});
createApp({render:()=>h(RouterView)}).use(pinia).use(router).mount('#app');
`;
const server = await createServer({
    configFile: false,
    cacheDir: 'node_modules/.vite-profile-preview',
    plugins: [vue(), tailwind(), {
        name: 'profile-preview',
        resolveId(id) { if (id === '/profile-preview.js') return '\0profile-preview'; },
        load(id) { if (id === '\0profile-preview') return entry; },
        configureServer(server) {
            server.middlewares.use((req, res, next) => {
                if (req.url === '/') {
                    res.setHeader('Content-Type', 'text/html; charset=utf-8');
                    res.end('<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Profil - test isole</title></head><body><div id="app"></div><script type="module" src="/profile-preview.js"></script></body></html>');
                    return;
                }
                next();
            });
        },
    }],
    resolve: { alias: { '@': resolve('src') } },
    server: { host: '127.0.0.1', port: 5191, strictPort: true },
});
await server.listen();
console.log('Profil isole : http://127.0.0.1:5191');
