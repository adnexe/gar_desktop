# PROGRESS — GAR Desktop (caissières / chef de gare)

État au 12/07/2026. App Electron + Vue 3 + TypeScript pour les opérations de guichet (vente de tickets, bagages, courrier, création de voyage), fonctionnant hors-ligne avec une base SQLite locale. Complète l'app [`admin`](../admin/PROGRESS.md) (Laravel), qui reste seule responsable de la configuration (villes, trajets, tarifs, agences, agents...).

## Stack technique

| Composant | Version |
|---|---|
| Electron | ^43.1.0 |
| electron-vite | ^5.0.0 |
| Vue | ^3.5.13 |
| Vue Router | ^4.5.1 |
| Pinia | ^3.0.4 |
| TypeScript | ^5.9.3 |
| better-sqlite3 | ^12.11.1 (+ `@electron/rebuild`) |
| uuid | ^14.0.1 (uuid v7) |
| bcryptjs | ^3.0.3 |
| Tailwind CSS | ^4.1.1, reka-ui, class-variance-authority — **kit UI identique à `admin`**, copié depuis `admin/resources/js/Components/ui` |

## Architecture

```
desktop/
  electron/            Backend Electron (MVC/Services)
    main.ts             fenêtre, wiring IPC
    preload.ts           contextBridge → window.api.*
    ipc/                  canaux IPC (1 par méthode de contrôleur)
    controllers/          adaptateurs fins IPC → services
    services/             logique métier (Bootstrap, Auth, Vente, Bagage, Courrier, Voyage, Historique)
    repositories/         accès SQLite (1 par table/domaine)
    sync/                 SyncEngine/QueueManager/EventBus — push implémenté (voir « Synchronisation »)
    database/             connexion better-sqlite3, migrations (schéma en TS), génération uuid/numeroCourt
    apiClient/             appel HTTP vers l'API Laravel (bootstrap uniquement)
  src/                 Renderer Vue (MVVM)
    Views/               ConfigurationInitiale, Login, Dashboard, Vente, Bagages, Courrier, Voyages, Historique
    Components/ui/        kit UI porté depuis admin (bouton, dialog, select...)
    Layouts/CaisseLayout.vue
    Stores/               Pinia (session, config)
    router/                garde de navigation (redirige vers configuration/connexion si besoin)
```

## Côté Laravel (`admin/`)

- Sanctum activé (`php artisan install:api`), trait `HasApiTokens` ajouté à `User` **et** `Agence` (le token de synchronisation est porté par l'agence, pas par un utilisateur précis — le poste de caisse s'authentifie comme agence, pas comme personne).
- `POST /api/desktop/bootstrap` (`app/Http/Controllers/Api/DesktopBootstrapController.php`) : reçoit `{ reference, appareil }`, renvoie l'agence, toutes les villes, itinéraires+trajets (avec pivot), tarifs/chauffeurs/véhicules de l'agence, agents+users de l'agence (mot de passe bcrypt inclus, réutilisable tel quel pour un login local), et un token Sanctum.
- Throttle 10/min sur cette route (pas d'auth requise, la référence agence fait office de secret initial).
- Testé manuellement via `curl` : cas valide (payload complet) et cas référence invalide (404 propre). `php artisan test` reste vert (65 tests) après ces changements.

## Base SQLite locale

Schéma mirroir des migrations Laravel (`electron/database/migrations/index.ts`) : `villes, itineraires, trajets, itineraire_trajet, agences, chauffeurs, vehicules, agents, users, tarifs, voyages, clients, tickets, bagages, courriers, colis`, plus deux tables propres au Desktop :
- `config` (clé/valeur : référence agence, token API, date de configuration) ;
- `sync_queue` (journal de toute écriture locale — ticket, bagage, courrier, voyage — consommée par le `SyncEngine`, voir « Synchronisation »).

Les tables de catalogue reprennent l'`id` auto-incrémenté du serveur tel quel (pas de remapping) puisqu'elles sont en lecture seule côté Desktop. Les tables opérationnelles (tickets, bagages, courriers, voyages, clients) génèrent leur `uuid` **côté client** (uuid v7), condition posée par l'utilisateur pour que la synchronisation future n'ait jamais à réattribuer d'identifiant.

## Écrans livrés (fonctionnels en local, sans réseau après le premier réglage)

1. **Configuration initiale** : référence agence → `/api/desktop/bootstrap` → écriture SQLite.
2. **Connexion** : téléphone + mot de passe, vérifié en local via bcrypt (pas de session persistée — connexion à chaque démarrage, poste de caisse partagé).
3. **Dashboard** : résumé du jour, navigation vers les modules autorisés (`agents.type_agent`).
4. **Vente de ticket** : destination → résolution trajet bidirectionnelle → grille tarifaire ordinaire/VIP × aller/aller-retour → voyage → place libre → client (dédoublonné par téléphone) → vente → impression → **le formulaire n'est pas réinitialisé après la vente, le bouton devient « Vendre à nouveau », un bouton « Nouveau ticket » réinitialise explicitement** (reprend le choix déjà validé côté admin).
5. **Bagages** : recherche par code court, montant, description facultative, impression.
6. **Courrier** : destination, expéditeur/destinataire, colis multiples, prix d'expédition, impression.
7. **Création de voyage** : itinéraire, véhicule, chauffeur (facultatif), date/heure/n° de départ.
8. **Historique** : tickets/bagages/courriers du jour.

## Vérification effectuée

- `npx vue-tsc --noEmit` : aucune erreur.
- `npm run build` (vue-tsc + electron-vite build) : succès, main/preload/renderer compilés.
- `npm run dev` : l'app Electron démarre réellement (process principal + renderer confirmés vivants via `ps`), les migrations s'exécutent automatiquement au premier boot (vérifié : les 16 tables + `config`/`sync_queue`/`migrations` sont bien créées dans `~/Library/Application Support/gar-desktop/gar-desktop.sqlite3`).
- **Bug trouvé et corrigé pendant cette vérification** : le preload (`out/preload/index.mjs`, format ESM car `package.json` a `"type": "module"`) ne se chargeait pas dans le renderer sandboxé par défaut d'Electron (erreur silencieuse côté terminal, visible seulement via les logs console du renderer qu'on a dû relayer explicitement). Corrigé en passant `sandbox: false` sur la fenêtre et en pointant `main.ts` vers le bon fichier (`index.mjs`, pas `index.js`). `contextIsolation` reste actif.
- **Non testé** : le flux complet à travers l'interface graphique (saisie réelle au clavier/souris dans la fenêtre Electron) — aucun outil de preview navigateur ne s'applique à une fenêtre Electron native. La logique métier (services/repositories) est vérifiée par relecture et par le typage strict, pas par exécution avec des données réelles saisies à la main.

## Explicitement pas fait dans cette étape (voir plan)

- Synchronisation réelle (push/pull), gestion de conflits, retry/backoff, détection de connexion en arrière-plan — seul le squelette (`sync/`, table `sync_queue`) existe.
- Clôture de caisse avec règles métier, statistiques avancées, annulation de ticket.
- Packaging/distribution (installeurs `electron-builder`), auto-update.
- URL de l'API configurable en production (actuellement codée en dur sur `http://127.0.0.1:8000` en dev via `electron/apiClient/index.ts`, à rendre configurable avant packaging).

## Prochaines étapes possibles

- Test manuel complet au clavier/souris de la fenêtre Electron (bootstrap réel avec une référence d'agence, connexion, vente, impression).
- Implémenter le vrai `SyncEngine.runCycle()` (push de `sync_queue`, pull incrémental des mises à jour de catalogue).
- Rendre l'URL de l'API configurable (variable d'environnement ou écran de configuration).
- Packaging (`electron-builder`) pour distribuer l'app aux agences.

## Branding Adenexe Transport (14/07/2026)

- Logo bus « Adenexe Transport » (même design que l'admin) : `src/Components/AppLogoIcon.vue` (copié depuis l'admin), sidebar (`AppLogo.vue`), écrans Connexion et Configuration initiale.
- Icônes d'application dans `build/` : `icon.png` (fenêtre/barre des tâches Win/Linux, réglée dans `main.ts`), `icon.ico` (Windows) et `icon.icns` (macOS) — electron-builder les détecte automatiquement au packaging, remplaçant l'icône Electron par défaut. En dev sur macOS, le Dock est réglé via `app.dock.setIcon()`.
- Titre de fenêtre et de page : « Adenexe Transport — Caisse ». `productName` volontairement non modifié pour ne pas déplacer le dossier de données (`gar-desktop`).


## Synchronisation (14/07/2026) — implémentée

- **Push** : `SyncEngine` consomme `sync_queue` par lots de 50 vers `POST /api/desktop/sync` (token Sanctum de l'agence). Déclenché 300 ms après chaque écriture locale + cycle toutes les 30 s ; hors-ligne détecté (`net.isOnline`) ; erreurs classées temporaire (retry 15 s) / définitive (marquée, non bloquante) / stop (ex. token invalide). Arrêt propre à la fermeture.
- **Pull** : catalogue rafraîchi au démarrage via `BootstrapService.actualiser()`.
- **Serveur** : `DesktopSyncController` (admin), idempotent par uuid ; migrations `merge_duplicate_clients_and_unique_phone` + `add_source_to_clients` (clients séparés par source ticket/courrier). 5 tests Feature dédiés.
- ⚠️ Les migrations doivent être exécutées sur chaque environnement (`php artisan migrate`) — leur oubli sur la base dev bloquait vente et courrier (corrigé le 14/07).
