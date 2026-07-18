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

## Branding Adnexe Transport (14/07/2026)

- Logo bus « Adnexe Transport » (même design que l'admin) : `src/Components/AppLogoIcon.vue` (copié depuis l'admin), sidebar (`AppLogo.vue`), écrans Connexion et Configuration initiale.
- Icônes d'application dans `build/` : `icon.png` (fenêtre/barre des tâches Win/Linux, réglée dans `main.ts`), `icon.ico` (Windows) et `icon.icns` (macOS) — electron-builder les détecte automatiquement au packaging, remplaçant l'icône Electron par défaut. En dev sur macOS, le Dock est réglé via `app.dock.setIcon()`.
- Titre de fenêtre et de page : « Adnexe Transport — Caisse ». `productName` volontairement non modifié pour ne pas déplacer le dossier de données (`gar-desktop`).


## Synchronisation (14/07/2026) — implémentée

- **Push** : `SyncEngine` consomme `sync_queue` par lots de 50 vers `POST /api/desktop/sync` (token Sanctum de l'agence). Déclenché 300 ms après chaque écriture locale + cycle toutes les 30 s ; hors-ligne détecté (`net.isOnline`) ; erreurs classées temporaire (retry 15 s) / définitive (marquée, non bloquante) / stop (ex. token invalide). Arrêt propre à la fermeture.
- **Pull** : catalogue rafraîchi au démarrage via `BootstrapService.actualiser()`.
- **Serveur** : `DesktopSyncController` (admin), idempotent par uuid ; migrations `merge_duplicate_clients_and_unique_phone` + `add_source_to_clients` (clients séparés par source ticket/courrier). 5 tests Feature dédiés.
- ⚠️ Les migrations doivent être exécutées sur chaque environnement (`php artisan migrate`) — leur oubli sur la base dev bloquait vente et courrier (corrigé le 14/07).

## Renommage app Electron (14/07/2026)

- `productName: "Adnexe Transport"` dans `package.json` : nom affiché une fois packagée (menu macOS, exe/installateur Windows) et nouveau dossier de données `~/Library/Application Support/Adnexe Transport/` (idem `%APPDATA%` sur Windows).
- Migration automatique au premier lancement : la base `gar-desktop.sqlite3` (+ wal/shm) est copiée depuis l'ancien dossier `gar-desktop/` si présente (`migrerDonneesAncienNom()` dans `main.ts`) — vérifié en réel : config d'agence et données conservées.
- En dev (`npm run dev`), le processus s'affiche toujours « Electron » dans le Dock/menu : c'est normal, le vrai nom n'apparaît qu'après packaging electron-builder.

## Impression (14/07/2026) — voie PDF sous Windows

- Le module d'impression Chromium/Electron est cassé sous Windows : « Invalid printer settings » sur TOUTES les imprimantes (même Print to PDF), quelles que soient les options (dpi/pageSize explicites testés sans succès sur le poste réel).
- **Solution** (`electron/ipc/index.ts`) : sous Windows, le reçu est rendu en PDF (`webContents.printToPDF`, 80 mm de large, marges nulles, `preferCSSPageSize`) puis imprimé silencieusement via **SumatraPDF embarqué** (paquet `pdf-to-printer`, CommonJS → import par défaut). Cibles : imprimante par défaut puis chaque imprimante physique ; les imprimantes virtuelles (OneNote, Fax, XPS, Print to PDF...) sont exclues du repli automatique.
- Ancienne échelle `webContents.print()` conservée en repli (et voie principale sur macOS/Linux), dialogue système en ultime recours.
- Packaging : `build` dans `package.json` (`appId com.adnexe.caisse`, `asarUnpack` pour que SumatraPDF.exe soit exécutable hors asar). `pdf-to-printer` est en `dependencies`.
- Concerne tickets, bagages, courriers + le ticket de test.


## Impression en deux coupes (14/07/2026)

- Le talon de contrôle du ticket (et l'étiquette colis du courrier) partent désormais en **deux jobs d'impression séparés** : l'imprimante coupe le papier entre les deux, plus rien n'est collé.
- Mécanisme : prop `partie` sur `TicketRecu.vue` (`ticket`/`talon`) et `CourrierRecu.vue` (`recu`/`etiquette`), pilotée par les formulaires pendant chaque passage d'impression.
- Règle métier : l'échec du **premier** job (ticket/reçu client) annule la vente comme avant ; l'échec du **second** (talon/étiquette) n'annule rien — le client a déjà son ticket — un avertissement s'affiche simplement.

## Lisibilité et vitesse d'impression (14/07/2026)

- **Lisibilité** : les reçus ticket/bagage/courrier utilisaient `Courier New` 11px (police fine → pâle sur thermique) et un bandeau gris tramé. Alignés sur le style du reçu de fin de caisse (le plus lisible) : Arial 13px, petits textes 11-12px, fond blanc. Fichiers : `TicketRecu.vue`, `CourrierRecu.vue`, `BagageRecu.vue`.
- **Vitesse** : la page PDF faisait 11,7 po de haut quel que soit le reçu → l'imprimante déroulait du papier vide. Le renderer mesure désormais la hauteur réelle de `.zone-impression` (`src/lib/impression.ts`) et la transmet par IPC (`imprimerTicket(hauteurMm)` / `imprimerRecu(hauteurMm)`) ; `printToPDF` dimensionne la page en conséquence (bornes 1,5–40 po). Impression plus rapide + économie de papier.

## Espace blanc en tête de ticket (15/07/2026)

Deux causes corrigées :
1. La mesure de hauteur (`src/lib/impression.ts`) renvoyait toujours 0 : la `.zone-impression` est en `display:none` à l'écran. Corrigé en révélant la zone hors-écran le temps de la mesure. Vérifié par harnais : le PDF généré démarre au ras du contenu et fait exactement sa hauteur (106 mm pour le ticket type).
2. SumatraPDF centre une page plus petite que le papier du pilote (souvent 80×297) → blanc avant le ticket. Corrigé en passant un papier personnalisé à la taille exacte du reçu (`paperSize: "80mm x Hmm"` → `-print-settings paper=…`), avec repli sans format personnalisé si le pilote refuse.

## Thème sombre (15/07/2026)

- Bouton lune/soleil dans la barre du haut (`ThemeToggle.vue` + `useAppearance` déjà présent) : bascule clair/sombre, persistée en localStorage.

## Écran blanc au lancement (15/07/2026)

- La fenêtre s'affichait avant le premier rendu du renderer → flash blanc de ~1-2 s au lancement de l'exe. Corrigé dans `main.ts` : `show: false` + affichage sur l'événement `ready-to-show`, et `backgroundColor` sombre pour les repaints intermédiaires.

## Faille licence corrigée (15/07/2026)

- **Faille** : l'invalidation d'une licence (expirée/désactivée/supprimée côté admin) n'était appliquée qu'en mémoire du renderer — un redémarrage rechargeait la licence locale intacte et débloquait le poste ; et la vérification en ligne n'avait lieu qu'à l'écran de connexion.
- **Corrections** :
  - `BootstrapService.reclamerLicence` **persiste** l'invalidation en base locale (`licence_actif=0` + statut) pour tout statut bloquant renvoyé par le serveur : `expiree`, `desactivee`, `aucune_licence`, `inexistante`, `agence_desactivee`. Une panne réseau, elle, ne bloque jamais (tolérance hors-ligne).
  - `verifierLicenceEnLigne()` appelée par le SyncEngine **au plus une fois par heure dès qu'un réseau est disponible** : couvre le lancement (premier cycle ~2 s) et le retour de connexion. Passe par `reclamer` → si l'admin a créé une nouvelle licence, elle est automatiquement assignée (renouvellement sans intervention).
  - Garde de navigation : l'état local de la licence est relu à **chaque navigation** → une invalidation faite en arrière-plan bloque le poste au prochain écran.
  - Serveur : la réponse « agence introuvable/désactivée » porte désormais un statut explicite (`agence_desactivee`).
- **Vérifié en réel** : desktop pointé sur un admin sans licence → log « Licence locale invalidée », `licence_actif=0` en base locale.

## Réinitialisation si agence supprimée (15/07/2026)

- Le serveur distingue désormais `agence_inexistante` (supprimée) de `agence_desactivee` (réversible).
- **Agence désactivée** → poste bloqué sur l'écran licence (les données locales restent, réactivable côté admin).
- **Agence supprimée** → `reinitialiserPoste()` vide toute la base locale (schéma conservé) et le poste revient à l'écran de configuration initiale (saisie de la référence agence). Déclenché uniquement sur réponse ferme du serveur, jamais sur panne réseau. La garde de navigation relit `configuree` + licence à chaque écran.
- Vérifié en réel : agence inconnue du serveur → base vidée (0 lignes partout) + log « poste réinitialisé ».

## Pré-génération PDF : correction de vitesse (15/07/2026)

- Le cache PDF prégénéré (préparé à chaque modification du formulaire) était en pratique PLUS LENT que la méthode directe : la saisie du client (dernier champ rempli) invalidait l'empreinte en permanence, et `vendre()` attendait alors la préparation complète des 2 PDF avant d'enregistrer.
- Corrigé dans `VenteForm.vue` : plus de préparation pendant la saisie (watch supprimé) — elle se lance à l'**ouverture de la confirmation** (champs figés, 1-3 s avant le clic, comme bagage/courrier qui faisaient déjà comme ça) et après une vente pour « Vendre à nouveau ». Au clic « Vendre » : **attente bornée à 800 ms** (`attendrePreparationPdf`), sinon voie classique immédiate — jamais plus lent que l'ancienne méthode.

## Attente de préparation sûre (15/07/2026)

- La borne de 800 ms envisagée au clic « Vendre/Enregistrer » créait une course : préparation encore en cours + voie classique utilisant la même `.zone-impression` en parallèle (risque de ticket vide/mélangé). Règle finale, pour les trois modules : la préparation démarre à l'ouverture de la confirmation (champs figés, donc toujours pertinente) et, si elle tourne encore au clic, on **l'attend jusqu'au bout** — quelques centaines de ms au pire, généralement 0 (elle a fini pendant la lecture du dialog). Jamais deux impressions concurrentes.
- Ce qui protège la vente : préparation uniquement sur champs figés, empreinte + séquence pour invalider tout cache obsolète, numéro réservé vérifié contre le numéro réellement vendu (cache jeté si différent), et voie classique en repli intégral.


## Cache du contrôle imprimante (15/07/2026)

- `verifierDisponible` (PowerShell Win32_Printer / lpstat CUPS, 0,3-1 s) était appelé à chaque clic de vente dans le chemin critique. Résultat POSITIF mis en cache 10 s (`ipc/index.ts`) ; un échec n'est jamais mis en cache. Si l'imprimante est débranchée dans l'intervalle, l'impression échoue proprement → ticket annulé (filet existant).

## Impression : retour à la version simple (18/07/2026)

- Après tests terrain, la prégénération de PDF (empreintes, numéros réservés, caches) n'apportait aucun gain perceptible : le temps est dominé par SumatraPDF + la mécanique de l'imprimante, et le contrôle PowerShell ajouté au passage (~0,5-1 s/vente) annulait le bénéfice.
- **Revert chirurgical au commit `120c3ff` (16/07 17:12)** des 5 fichiers d'impression : `electron/ipc/index.ts`, `VenteForm.vue`, `BagageForm.vue`, `CourrierForm.vue`, `src/lib/impression.ts` — c'est la méthode directe : vente → PDF → SumatraPDF, deux jobs (ticket puis talon).
- Canaux non-impression ajoutés après le 16/07 réinjectés dans `ipc/index.ts` : `config:relancerServeurLocal`, `config:nettoyerDonneesTest`, `diagnostic:log`. Tout le reste (licences, reset agence, sync...) est inchangé.
