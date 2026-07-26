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

## Fin de caisse par voyage (18/07/2026)

- Écran Vente : le dialog « Fin de caisse » propose désormais un sélecteur « Tous les voyages » (comportement existant, inchangé) ou un voyage précis du jour — seuls les voyages ayant au moins un ticket valide sont listés (itinéraire, heure, n° de départ, nombre de tickets).
- Quand un voyage est choisi, le rapport (affiché et imprimé) ne compte que les tickets de ce voyage ; le reçu porte le titre « FIN DE CAISSE — VOYAGE » avec le libellé du départ.
- Chaîne : `TicketRepository.voyagesAvecVentes` + filtre `voyage_id` dans `rapportParVoyage` → `VenteService` → `VenteController` → canal IPC `vente:voyagesFinDeCaisse` + param `voyageId` sur `vente:finDeCaisse` → preload/types → `Vente.vue` + `FinDeCaisseRecu.vue`. Le filtre par caissier (non-admin = ses ventes seulement) s'applique aussi à la liste des voyages.
- Vérifié : requêtes testées sur une copie de la base (2 voyages, 3 tickets → global 15 300 ; voyage A 10 200 ; voyage B 5 100), build + vue-tsc OK.
- Ajustements : le sélecteur liste désormais **tous les voyages du jour** (même sans vente → rapport à 0), chaque option affiche l'occupation (`7/63`), un encart montre places vendues/restantes du voyage choisi (repris sur le reçu imprimé), et le menu du sélecteur est borné à la largeur du champ (texte tronqué) pour ne plus déborder du modal. La liste ne dépend plus du caissier (l'occupation est un fait du voyage) ; les montants, eux, restent filtrés par caissier.

## Bagages & courriers : détails, client, talon, fin de caisse enrichie (19/07/2026)

- **Bagage — client facultatif** : nouveau bloc « Client » (téléphone/nom/prénoms) dans le formulaire. Prérempli depuis le ticket trouvé ou par recherche téléphone (comme courrier) ; sinon saisie libre. Stocké via `clients` (source `bagage`, colonne `bagages.client_id`, migration locale `0014` + migration admin) et synchronisé vers l'admin (payload `client` dans `SyncEngine.bagagePayload`, accepté par `DesktopSyncController::syncBagage`).
- **Bagage — impression** : à l'enregistrement, le reçu part puis le **talon** en second job (coupe entre les deux). Échec du talon = avertissement, pas d'annulation (le reçu fait foi). Bloc « Dernier bagage » : Réimprimer reçu / Réimprimer talon.
- **Clic sur une ligne** (bagages ET courriers du jour) → dialog de détails complets (client, voyage, contenu/colis, montants, agent) avec **Réimprimer reçu / Réimprimer talon (étiquette)**. Nouveaux canaux `bagage:details` et `courrier:details`.
- **Courrier — formulaire** : après l'envoi, le formulaire garde le dernier reçu (bloc « Dernier courrier » : Réimprimer reçu / Réimprimer étiquette) — avant, tout était remis à zéro.
- **Fin de caisse bagages/courriers** : même sélecteur de voyage que les tickets (tous les voyages du jour + occupation, rapport filtré par `voyage_id`). Détails enrichis — bagages : valeur déclarée par destination + totaux avec/sans ticket ; courriers : nombre de colis + valeur déclarée par destination et en totaux. Reçu imprimé enrichi (`FinDeCaisseSimpleRecu` : props `voyage`, `complement`, `details`).
- **Données de test insérées en base locale de dev** (sans passer par la file de sync, donc jamais synchronisées) : 2 voyages du jour (18h/19h), 3 bagages (`test-bag-1..3`, dont un avec client Jean KOUASSI), 2 courriers (`test-cou-1..2`) avec 3 lignes de colis, clients `test-cli-*`. Nettoyage : `DELETE FROM colis WHERE uuid LIKE 'test-%'; DELETE FROM courriers WHERE uuid LIKE 'test-%'; DELETE FROM bagages WHERE uuid LIKE 'test-%'; DELETE FROM voyages WHERE uuid LIKE 'test-%'; DELETE FROM clients WHERE uuid LIKE 'test-%';`
- Correction demandée : les blocs de réimpression n'affichent plus que **Réimprimer talon** (bagage) / **Réimprimer étiquette** (courrier) — pas de réimpression du reçu client. Nouveaux canaux ajoutés aussi à la table `handlers` du serveur local (mode poste client).
- **Vérifié via harnais réel** (controllers compilés avec esbuild, electron stubé, exécutés avec le Node d'Electron sur une copie `.backup` de la base de dev) : `vente:voyagesFinDeCaisse` (2 voyages), `bagage:finDeCaisse` tous/901/902 (3→2→1), `courrier:finDeCaisse` tous/901 (2→1), `bagage:details`, `courrier:details`, `bagage:duJour` avec client — tous corrects, y compris avec les arguments `undefined` tels que l'IPC les transmet. Les filtres travaillent par `voyage_id` (jamais par libellé).
- Rappel dev : après modification du preload ou du main, il faut **arrêter complètement l'app et relancer `npm run dev`** — sinon l'ancien preload reste chargé (canaux manquants → « rien ne se passe » au clic, filtre voyage ignoré).

## Cloisonnement par agent + agents sur les fins de caisse (19/07/2026)

- **Chaque agent ne voit que ses propres opérations** partout : listes du jour et fins de caisse **bagages** et **courriers** (le filtre `user_id` n'existait que pour les tickets), plus **dashboard** et **historique** (`historique:duJour` prend un `userId`). Règle identique à la vente : `super_admin`, `admin` et `chef_gare` voient tout, les agents seulement leurs ventes.
- **Nom des agents responsables** : les trois rapports de fin de caisse (tickets, bagages, courriers) renvoient `agents: string[]` (DISTINCT `users.name` du périmètre filtré date/voyage/utilisateur). Affiché dans le modal (« Agent(s) : … ») **et sur le reçu imprimé** (`FinDeCaisseRecu` + `FinDeCaisseSimpleRecu`, prop `agents`). Pour un agent, c'est son nom ; pour un chef de gare, la liste de tous les vendeurs du périmètre.
- **Vérifié dans l'app réelle via CDP** : admin → 3 bagages/2 courriers + agents=[ESSIGAN AHA DELPHINE] ; agent 3 → ses 3 bagages/2 courriers ; agent 2 → 0 partout (bagages, courriers, historique) ; combinaison voyage 901 + agent 3 → 2 bagages. Build + vue-tsc OK.

## Impression : hauteur multi-zones, anti-rognage, et voie PDF sur macOS (19/07/2026)

- **Mesure de hauteur corrigée** (`src/lib/impression.ts`) : `hauteurZoneImpressionMm` mesurait uniquement la **première** `.zone-impression` du DOM. Or les formulaires (bagage/courrier/vente) sont dans des dialogs portalés en fin de body : la zone mesurée était celle de la page (vide) → hauteur `undefined` → page PDF de 297 mm. Désormais toutes les zones sont mesurées et on garde la plus haute (les autres sont vides). Vérifié en réel via CDP : réimpression talon bagage → 1 zone, 321 px → 89 mm.
- **Anti-rognage à droite** : sous Windows, SumatraPDF passe de `scale: 'noscale'` à `'shrink'` — identique quand la page tient dans la zone imprimable, sinon réduction au lieu d'un rognage (les thermiques 80 mm n'impriment que ~72 mm utiles).
- **macOS/Linux : même stratégie PDF que Windows** (`envoyerPdfImprimante` dans `ipc/index.ts`) : l'impression Chromium directe échoue aussi sur les thermiques côté macOS (« Invalid printer settings » constaté avec la POS-80 branchée au Mac de dev) et retombait sur le dialogue système en A4 → tickets décalés à droite/incomplets/mélangés. Désormais : printToPDF → `lp -d <imprimante> -o media=Custom.80xHmm`, avec les mêmes replis que Windows. Commande validée sur la file CUPS réelle (job accepté puis annulé).
- Rendu du talon bagage vérifié visuellement (capture du zone-impression rendu par Chromium) : toutes les infos présentes, alignées à gauche, aucune superposition.

## Bagage : préremplissage vérifié, talon enrichi, impression propre (19/07/2026)

- **Préremplissage client depuis le ticket** : vérifié en réel via le vrai formulaire (recherche ADJ003000099 → téléphone/nom/prénoms remplis automatiquement : Fatou DIABATE 0788990011).
- **Impressions coupées** : deux causes corrigées — logos des reçus à hauteur fixe (une image pas encore chargée faussait la mesure → bas coupé) et marge de sécurité passée de +4 à +8 mm ; côté CUPS (macOS), `-o fit-to-page` évite tout rognage par la zone imprimable du pilote.
- **Talon bagage restructuré** : tous les libellés sont toujours affichés, valeur vide si non renseignée — N° Ticket/Sans ticket, Place, DESTINATION (en gros), Voyage, CLIENT (nom + téléphone), CONTENU (description, valeur déclarée, montant payé), date + agence. Le téléphone client apparaît aussi sur le reçu.
- **Vérifié de bout en bout dans l'app réelle** : enregistrement d'un bagage via le formulaire (ticket lié) → aucune erreur, « Dernier bagage enregistré : ADJ004000002 », **3 jobs réels dans la file CUPS de la POS-80** (reçu + talon + réimpression). Rendu du talon capturé et validé visuellement.

## Boutons écrasés sur petits écrans (20/07/2026)

- Signalé sur les PC de bureau des gares (écrans 1366×768, souvent avec mise à l'échelle Windows 125 %) : les rangées date + « Fin de caisse » + bouton d'action des écrans Vente/Bagages/Courrier débordaient (boutons en `shrink-0 whitespace-nowrap` → jamais compressés, donc poussés hors cadre). Aucun lien avec le mode client-serveur — pure question de largeur d'écran.
- Correction : `flex-wrap` + pleine largeur sous le titre en dessous de `lg` — les contrôles passent à la ligne au lieu de déborder. Vérifié par émulation CDP à 1024 px et 860 px : rendu propre.
- **Passe responsive complète** : les 10 tableaux de l'app (vente, bagages, courrier, historique ×3, voyages, agents, chauffeurs, véhicules, tarifs, paramètres) sont désormais dans des conteneurs `overflow-x-auto` (défilement horizontal au lieu d'écrasement) ; rangée de contrôles de Voyages alignée sur le même modèle `flex-wrap`. Vérifié écran par écran à 1024 px émulés : **aucun débordement horizontal sur les 11 écrans** (mesure `scrollWidth` vs fenêtre + capture visuelle).

## Édition de voyage + statut (20/07/2026)

- **Édition d'un voyage existant** côté desktop, comme l'écran Voyages de l'admin : clic sur une ligne de la liste → dialog préremplie, on peut changer l'itinéraire, le véhicule, le chauffeur, la date/heure/n° de départ **et le statut** (programmé, embarquement, parti, terminé, annulé). Réservé au poste qui gère la base de référence (autonome ou serveur) — un poste client est redirigé vers « Actualiser depuis caisse », même règle que la création (`VOYAGE_GESTION_POSTE_CLIENT`).
- **Statut à la création aussi** : le formulaire de création propose désormais le même sélecteur de statut (par défaut « Programmé »), pour rester cohérent avec l'admin.
- Chaîne ajoutée : `VoyageRepository.modifier()`/`parUuid()` → `VoyageService.modifier()`/`details()` (garde poste-client) → `VoyageController` → canaux IPC `voyage:modifier`/`voyage:details` (déclarés aussi dans `LocalNetworkService.handlers`, sans être proxyés côté client — même traitement que `voyage:creer`) → preload/types → `VoyageForm.vue` (accepte désormais une prop `voyage` optionnelle ; le parent force un remontage via `:key` à chaque ouverture, ce qui évite tout problème de timing avec le dialog plutôt que d'exposer une méthode impérative) → `Voyages.vue` (titre dynamique, badges de statut colorés comme l'admin).
- **Synchro vers l'admin** : `queueManager.ajouter('voyages', uuid, donnees, 'update')` sur modification (au lieu de `'create'`). Côté admin, `DesktopSyncController::syncVoyage` reçoit maintenant `$operation` et applique les champs (itinéraire, véhicule, chauffeur, date/heure, statut) quand le voyage existe déjà et que l'opération est `update` — avant, une modification synchronisée était silencieusement ignorée (`deja_present: true` sans rien appliquer).
- **Vérifié dans l'app réelle** (poste basculé temporairement en mode autonome pour le test, remis en mode client ensuite, aucune donnée de test laissée en base) : création IPC → lecture des détails → modification (statut → annulé, heure changée) → relecture confirmant la persistance → **clic sur la ligne dans la vraie liste** → dialog « Modifier le voyage » avec les 4 champs corrects préremplis (itinéraire, véhicule, chauffeur « Aucun », statut « Annulé ») et le bouton « Enregistrer les modifications ». Build (`vue-tsc` + `electron-vite build`) et suite de tests admin (115 tests) OK.

## Édition de voyage : restreinte à véhicule/chauffeur/statut (20/07/2026)

- Faille corrigée : l'édition permettait de changer l'itinéraire, la date, l'heure et le n° de départ d'un voyage déjà créé — un même voyage aurait pu être « recyclé » sur un autre trajet/horaire alors que des places étaient déjà vendues dessus, ouvrant une porte à la revente. C'est désormais **structurellement impossible**, pas juste caché dans l'interface : `VoyageRepository.modifier()` ne touche que les colonnes `vehicule_id`, `chauffeur_id`, `statut` dans son `UPDATE` — même si le payload contient d'autres champs, ils sont ignorés (l'interface `ModificationVoyage` ne les déclare même plus). Idem côté admin (`DesktopSyncController::syncVoyage`, branche `update`) : seuls ces trois champs sont appliqués lors d'une synchro entrante.
- Formulaire (`VoyageForm.vue`) : en édition, l'itinéraire/date/heure/n° de départ sont affichés **désactivés** (grisés, non cliquables) avec un message explicatif ; seuls véhicule, chauffeur et statut restent modifiables. En création, tout reste éditable comme avant.
- **Vérifié par une attaque simulée** : appel direct du canal IPC `voyage:modifier` avec un payload « hostile » incluant `itineraireId`, `dateDepart`, `heureDepart`, `numeroDepart` en plus des champs autorisés → relecture des détails après coup : ces quatre champs sont restés strictement identiques à la création, seuls véhicule/chauffeur/statut ont changé. Confirmé aussi visuellement dans le vrai dialog d'édition (attribut `data-disabled` présent sur le select Itinéraire et absent sur Véhicule/Chauffeur/Statut, inputs date/heure/n° avec `disabled=true`).
- Build (`vue-tsc` + `electron-vite build`) et suite de tests admin (115) OK. Aucune donnée de test laissée en base locale ni côté admin après vérification.

## Impression : marges symétriques pour absorber les écarts entre imprimantes (21/07/2026)

- Signalé : sur Xprinter les reçus/talons sortent bien centrés, mais sur une imprimante Epson le contenu est rogné et laisse une marge à gauche — cohérent avec le fonctionnement de SumatraPDF confirmé par la doc/communauté (recherché) : SumatraPDF n'a aucun contrôle de marge, la position du contenu sur le papier dépend entièrement du pilote de l'imprimante. Deux pilotes différents (Epson vs Xprinter) peuvent donc positionner un même PDF différemment.
- Correctif structurel (fonctionne quel que soit le pilote) : tous les reçus/talons (ticket, bagage, courrier, fins de caisse) sont passés de **72mm plein cadre à gauche** à **70mm centrés dans les 80mm de papier** (`.zone-impression` fait maintenant explicitement 80mm de large en impression, chaque reçu y est centré via `margin: 0 auto`) — 5mm de marge symétrique de chaque côté absorbent un décalage horizontal propre à un modèle d'imprimante au lieu de rogner le texte d'un seul côté. Vérifié par mesure DOM exacte : zone 80.00mm, reçu 70.00mm, marge gauche 5.00mm, marge droite 5.00mm.
- Marge de sécurité verticale (bas de ticket coupé) portée de +8 à +10mm dans `hauteurZoneImpressionMm()`.
- La cause probable des « numéros de siège coupés » est la même marge insuffisante : ils sont en bout de ligne (alignés à droite), donc les premiers touchés dès que le contenu déborde légèrement de la zone imprimable réelle. Corrigé par le même changement de marges.
- Limite honnête : si un pilote applique un **décalage franchement asymétrique** (marge gauche fixe importante côté matériel), aucun réglage côté app ne peut deviner ce chiffre exact — il faudra alors ajuster les marges dans les propriétés du pilote Windows de cette Epson (Périphériques et imprimantes → Propriétés → Préférences d'impression → format/marges du papier). Le correctif ci-dessus couvre les décalages usuels (quelques mm) et ne dégrade pas le rendu déjà bon sur Xprinter.
- Libellé « N° » trop court sur le siège remplacé par « Siège » (ticket : ligne « Siège / N° X » ; talon contrôle : « Siège / Bus ») ; bagage : label « Place » → « Siège » sur le talon, et le numéro de siège (s'il existe, via le ticket lié) est désormais aussi affiché sur le **reçu** bagage (absent auparavant, seulement sur le talon).
- Vérifié en réel (capture + mesure DOM) sur le reçu et le talon bagage avec un ticket lié siège n°42 : « Siège N° 42 » s'affiche bien aux deux endroits, rien de tronqué. Build (`vue-tsc` + `electron-vite build`) OK ; les 3 vues qui impriment (Vente, Bagages, Courrier) portent bien la règle CSS 70mm dans leur bundle compilé.

## Plan de sièges réaliste selon la disposition du véhicule (21/07/2026)

- Demande : reproduire la disposition réelle des bus (photo d'une fiche de réservation papier) — sièges alignés par 3 après le chauffeur, par 2 de l'autre côté de l'allée pour certains véhicules, 2+2 pour d'autres, numéro toujours en haut à droite de la case, sièges d'extrémité (fenêtre) repérés par une icône.
- **Numérotation confirmée avec l'utilisateur** (calée sur la photo) : dans chaque rangée, le n°1 est le siège fenêtre du bloc de droite ; les numéros augmentent en allant vers la fenêtre du bloc de gauche (ex. 3-2 : rangée 1 = 5-4-3 | 2-1, rangée 2 = 10-9-8 | 7-6, etc — vérifié position par position contre la photo).
- **Synchro non destructrice** : `vehicules.disposition_sieges` (nullable, migration locale `0015_disposition_sieges_vehicules`, `ALTER TABLE ADD COLUMN`) alimentée automatiquement par le rafraîchissement périodique du catalogue déjà existant (`CatalogueRepository.seed()`, `INSERT OR REPLACE`) — aucun nouveau point de synchro à créer, aucune donnée existante perdue des deux côtés (admin + desktop).
- Champ propagé : `VehiculeApi` (types/bootstrap) → `CatalogueRepository` → `VoyageRepository.disponiblesPourTrajet`/`VoyageDisponible` → `VenteService.rechercherVoyages` → `VenteForm.vue` → nouvelle prop `disposition` de `SeatMap.vue`.
- `SeatMap.vue` réécrit : calcule les rangées en blocs de 5 (3-2) ou 4 (2-2) selon la disposition, place le numéro en haut à droite de chaque siège, icône `Blinds` (persienne) en haut à gauche des sièges fenêtre (première et dernière position de chaque rangée). **Sans disposition définie** (véhicules non configurés) → repli sur un plan générique 2+2 avec la même numérotation par fenêtre — rien ne casse, juste plus réaliste que l'ancien affichage neutre.
- **Vérifié avec le vrai composant compilé** (monté isolément dans l'app en cours d'exécution via import du module Vite, pas une simulation) sur 3 cas : 3-2/13 places (avec rangée partielle), 2-2/12 places, et sans disposition. Capture d'écran de chaque cas : numérotation et icônes fenêtre exactement conformes à l'algorithme et à la photo fournie, y compris le cas de rangée incomplète (les positions les plus basses — bloc droite — sont remplies en priorité).
- Build desktop (`vue-tsc` + `electron-vite build`) et build admin (`vite build`) + suite de tests admin (115) OK.

## Correction : dernière rangée décalée sur plan de sièges (21/07/2026)

- Bug signalé : quand `nombre_places` n'est pas un multiple exact de la taille de rangée (ex. 70 sièges en 2-2 → 17 rangées pleines + 1 rangée de 2), la dernière rangée avait son bloc gauche complètement vide → le `<div>` vide s'effondrait en largeur et décalait tout le bloc droite vers la gauche.
- Corrigé dans `SeatMap.vue` : les blocs gauche/droite ont désormais toujours une taille fixe (celle de la disposition), les places manquantes sur la dernière rangée deviennent des cases invisibles de même taille (`size-11`, aucune bordure) au lieu d'être simplement omises — l'emplacement reste réservé, l'alignement ne bouge plus.
- Vérifié par mesure exacte (pas seulement visuel) sur un cas 2-2/70 places : position X du bloc droite strictement identique sur les 18 rangées (146px partout), dernière rangée = sièges 70 et 69 bien alignés sous la colonne droite, colonne gauche vide à cet endroit. Build OK.

## Réseau local : code fixe + connexion client au lancement (21/07/2026)

- **Code réseau fixé** (demande explicite, temporaire) : `LocalNetworkService.genererSecret()` renvoie désormais toujours `'ADNEXE01'` au lieu d'un `randomBytes(4)` aléatoire. Un poste déjà configuré en serveur avec un ancien code aléatoire **converge automatiquement** vers le code fixe au prochain démarrage/redémarrage du serveur (`demarrerServeur()` réaligne `reseau_secret` avant de (re)lancer l'écoute) — aucune reconfiguration manuelle nécessaire sur les postes déjà en service. Pour revenir à un code aléatoire par poste, remettre `randomBytes(4).toString('hex').toUpperCase()` dans `genererSecret()` (commentaire laissé dans le code).
- **Serveur relancé au lancement de l'app** : déjà en place (`main.ts` appelle `localNetworkService.demarrerDepuisConfig()` à `app.whenReady()`, qui redémarre l'écoute HTTP si `reseau_mode === 'serveur'`) — vérifié, rien à changer.
- **Client : connexion à la caisse serveur ajoutée au lancement.** Avant, un poste client ne contactait sa caisse serveur qu'à l'ouverture d'un écran précis (bagage, courrier, voyages) — rien au démarrage de l'app. Ajouté `LocalNetworkService.connecterClientDepuisConfig()`, appelé dans `main.ts` juste après le démarrage serveur : si `reseau_mode === 'client'`, tente immédiatement `actualiserVoyagesDepuisServeur()`. Échec (serveur pas encore allumé) → simple avertissement dans les logs, le poste démarre quand même normalement avec sa base locale ; chaque écran retente sa propre synchro comme avant.
- **Vérifié en conditions réelles** (vrai serveur HTTP lancé par l'app, vrais appels réseau, pas de simulation) : après redémarrage, `reseau_secret` est passé de l'ancien code aléatoire à `ADNEXE01` sans action manuelle ; requête `GET /api/local/status` avec `ADNEXE01` → 200 OK (infos agence renvoyées) ; même requête avec un mauvais code → 403 ; appel `POST /api/local/rpc` (canal `voyage:exporterPourClient`, celui utilisé par `actualiserVoyagesDepuisServeur`) avec `ADNEXE01` → voyages renvoyés correctement ; avec un mauvais code → 403 rejeté. Build OK.

## Expérience "fun et rassurante" — première vague (21/07/2026)

- **Accueil variable** (Dashboard.vue) : le titre change de formulation selon l'heure et le jour (matin/après-midi/soir/vendredi), tiré parmi plusieurs variantes à chaque ouverture — plus le même texte figé à chaque fois. Toutes les infos existantes (agence, rôle, date, stats) restent identiques, rien retiré.
- **Attente visible pendant l'enregistrement** : les boutons "Confirmer" de vente/bagage/courrier affichent désormais un spinner animé + texte d'état ("Vente en cours…", "Enregistrement…") au lieu de se contenter d'un bouton grisé sans autre signe — l'objectif est d'éviter le doute "ça a planté ?" pendant l'impression. Même traitement sur "Chargement des voyages..." (vente).
- **Messages d'erreur reformulés** : les messages génériques ("Une erreur est survenue", "L'enregistrement a échoué") remplacés par un ton rassurant qui dit explicitement que rien n'a été perdu et qu'il suffit de réessayer, sur les trois formulaires (vente, bagage, courrier). Les messages déjà détaillés (annulation après échec d'impression, incohérence à vérifier) sont laissés tels quels — déjà informatifs.
- Prochaine vague envisagée (pas commencée) : historique du jour en mode "journal" plutôt que tableau, petite phrase d'intro à la fin de caisse, mascotte simple sur le dashboard.
- Build (`vue-tsc` + `electron-vite build`) OK, accueil vérifié en conditions réelles dans l'app (rendu "Bel après-midi, Fatou" sans erreur).

## Fun côté écran uniquement — fin de caisse (21/07/2026)

- Décision explicite : le "fun" ne touche QUE l'écran (dialogs), jamais les documents imprimés — les reçus/tickets/fins de caisse imprimés (`TicketRecu`, `BagageRecu`, `CourrierRecu`, `FinDeCaisseRecu`, `FinDeCaisseSimpleRecu`) restent strictement inchangés et professionnels (destinés aux clients et au patron).
- Nouveaux composables partagés : `useSalutation.ts` (phrase d'accueil variable selon l'heure/le jour, réutilisé aussi par le Dashboard qui utilisait une copie locale — factorisé) et `useCompteurAnime.ts` (anime un total de 0 jusqu'à sa valeur réelle, effet purement visuel, la valeur affichée finale et celle imprimée sont toujours identiques).
- Appliqué aux 3 dialogs de fin de caisse (Vente, Bagages, Courrier) : phrase d'accueil en haut du dialog, montant total qui s'anime à l'ouverture/au changement de filtre voyage, bouton Imprimer avec spinner + texte "Impression…" pendant l'envoi à l'imprimante.
- Explicitement laissé tel quel sur demande : le comportement après une impression réussie (pas de message ni de fermeture automatique ajoutés).
- Idée "historique en mode journal" abandonnée : les agents consultent rarement cet écran, ils sont concentrés sur Vente et Fin de caisse — effort concentré là où c'est utile.
- Vérifié en conditions réelles : salutation "Bon courage pour la suite, Fatou ! Voici le récap." affichée, total animé qui se stabilise bien à la vraie valeur (220 000 FCFA), bouton Imprimer fonctionnel. Build (`vue-tsc` + `electron-vite build`) OK.

## Correction : animation du total invisible (21/07/2026)

- Bug : dans `ouvrirFinDeCaisse()` (Vente/Bagages/Courrier), le rapport était chargé (et l'animation lancée) **avant** l'ouverture du dialog (`finDeCaisseOuvert.value = true` en dernier) — l'animation de 500ms se terminait donc entièrement pendant que le dialog était encore invisible, l'utilisateur ne voyait jamais que la valeur finale.
- Corrigé : le dialog s'ouvre en premier (avec `rapportFinDeCaisse` remis à `null`), le chargement + l'animation se font après, pendant que c'est déjà affiché.
- Vérifié par échantillonnage réel pendant l'ouverture : `78548 → 143704 → 194427 → 230752 → 252592 → 259999 → 260000 FCFA` — progression bien visible, se stabilise sur la vraie valeur. Build OK.

## Mise à jour automatique (21/07/2026)

- Ajout de `electron-updater` + config `publish` (provider `generic`, `https://std.adnexe.com/updates/desktop/`) dans `package.json`. Import CommonJS via `import electronUpdater from 'electron-updater'; const { autoUpdater } = electronUpdater;` (même contrainte ESM que `pdf-to-printer`).
- `electron/services/UpdateService.ts` : au démarrage (uniquement en build packagé, pas en dev — `estDev` guard dans `main.ts`), vérifie une mise à jour, la télécharge en arrière-plan si trouvée, puis **`autoInstallOnAppQuit = true`** — l'installation ne se fait qu'à la prochaine fermeture normale de l'app, jamais forcée en pleine vente. Nouvelle vérification toutes les 4h (l'app reste ouverte toute la journée).
- Notification discrète : quand le téléchargement est terminé, un badge « Mise à jour prête » apparaît dans l'en-tête (à côté du badge licence) via un nouvel événement IPC `mise-a-jour:prete` (canal `window.api.miseAJour.surMiseAJourPrete`, préexistant nulle part ailleurs — premier événement poussé du main vers le renderer dans l'app).
- Pas de signature de code : Windows affichera toujours l'avertissement SmartScreen à l'installation initiale, comme aujourd'hui — l'auto-update fonctionne quand même.
- **Reste à faire côté déploiement** (pas fait ici, nécessite un accès serveur) : créer le dossier public `updates/desktop/` sur `std.adnexe.com`, et après chaque `npm run build:win:nsis`, uploader le contenu de `desktop/release/` (l'installeur `.exe` + `latest.yml`) dans ce dossier. Sans ces deux étapes côté serveur, l'auto-update ne trouvera rien (échec silencieux, log "Vérification de mise à jour impossible", le poste continue de fonctionner normalement).
- Build (`vue-tsc` + `electron-vite build`) OK ; démarrage de l'app vérifié sans crash après ajout du service (guard dev confirmé : aucune tentative réseau de mise à jour en développement).

## Commission courtier sur la vente de tickets (21/07/2026)

- Demande : certains courtiers envoient des clients à la gare, et touchent en échange une commission que la caissière connaît et saisit elle-même après la vente. Objectif : pouvoir la enregistrer par ticket et obtenir, en fin de caisse, un détail par voyage (comme le total) + un total commission, total billets, total timbre, et un total net après déduction du timbre et de la commission.
- **Scope explicitement limité au desktop pour l'instant** (décision utilisateur) : uniquement la vente de tickets, rien côté `admin/` (Laravel) — la colonne n'existe donc que dans la base SQLite locale.
- **Base** : migration `0016_commission_sur_tickets` — `ALTER TABLE tickets ADD COLUMN commission REAL NOT NULL DEFAULT 0`. Colonne nullable en pratique jamais nulle (défaut 0), donc aucune vente existante ni aucun calcul n'est cassé par la migration.
- **Chaîne desktop** : `TicketRepository` (`NouveauTicket`, `TicketRow`, `creer()`, `ventesDuJour()`) → `VenteService` (`DemandeVente.commission`, `vendre()`) → `VenteController` (inchangé, passe la demande telle quelle) → `VenteForm.vue` (champ + envoi) → `Vente.vue` (affichage liste + fin de caisse).
- **Placement du champ** (`VenteForm.vue`) : dans la carte "Type de ticket", sous le bloc "Total à payer" existant, séparé par une bordure et clairement labellisé "Commission courtier" avec la précision "n'affecte pas le total ci-dessus" — pour qu'une caissière ne confonde jamais ce montant avec ce que le client doit payer. Champ numérique, défaut 0, remis à 0 par "Nouveau ticket" comme le timbre. N'apparaît dans le dialog de confirmation que si > 0 (rien à voir pour le cas par défaut).
- **Volontairement exclu de la synchro admin** : `SyncEngine.ticketPayload()` (ce qui part vers `std.adnexe.com`) n'a **pas** été modifié — la commission ne remonte pas vers l'admin tant que ce dernier n'a pas la colonne/le traitement correspondant. En revanche, elle **est** incluse dans le canal réseau local poste-serveur/poste-client de la même gare (`TicketServeur`, `exporterTicketsPourClient`, `importerDepuisServeur` dans `TicketRepository`) puisque ce mécanisme ne touche jamais l'admin — sans ça, un poste client aurait perdu la commission saisie sur le poste serveur.
- **Calculs fin de caisse** (`TicketRepository.rapportParVoyage`, `VenteService.rapportFinDeCaisse`) : par voyage et en global — `montant_ventes` (billets seuls), `timbre_total`, `commission_total`, `montant_total` (inchangé : billets + timbre = ce qui est physiquement encaissé auprès des clients, reste le gros total affiché/animé), `montant_net` = `montant_ventes - commission_total` (ce que la gare garde une fois la commission déduite ; le timbre n'a jamais été un revenu de la gare, il est donc de facto déjà exclu du net dès qu'on part de `montant_ventes`).
- **Affichage** : ligne "Commission" ajoutée dans le tableau des ventes du jour (— si 0, pour ne pas polluer visuellement le cas courant). Dans le dialog de fin de caisse (écran ET reçu imprimé `FinDeCaisseRecu.vue`) : chaque voyage garde sa ligne existante (total encaissé) et gagne une sous-ligne "dont commission" uniquement si elle est non nulle pour ce voyage ; le récapitulatif global (toujours visible, que la commission soit utilisée ou non) affiche désormais total billets / total timbre / total commission / montant global encaissé / net après déduction.
- Décision volontaire : le ticket remis au client (`TicketRecu.vue`) n'affiche jamais la commission — c'est une donnée interne gare/courtier, pas une info client.
- Vérifié : `npm run typecheck` (vue-tsc) OK sur toute la chaîne (repository, service, composants).

### Complément : reçu imprimé détaillé + synchro admin activée (21/07/2026)

- **Reçu imprimé** (`FinDeCaisseRecu.vue`) : le détail par voyage (billets / timbre / commission / net) est désormais **toujours affiché**, même à 0 — contrairement à l'écran (dialog `Vente.vue`) qui reste volontairement épuré et ne montre la sous-ligne commission que si elle est utilisée. Un seul composant sert à la fois l'impression "par voyage" (un seul voyage sélectionné) et "tous les voyages" : ce changement couvre donc les deux cas automatiquement.
- **Synchro vers l'admin réactivée pour la commission** : `SyncEngine.ticketPayload()` envoie maintenant `t.commission` (précédemment exclu volontairement). Nécessaire pour que l'admin puisse superviser cette donnée — voir `admin/PROGRESS.md`.

## Correction : sens du nom de trajet selon l'agence (21/07/2026)

- **Bug signalé par l'utilisateur** (avec exemple concret Abidjan/Bouaké) : un trajet est bidirectionnel en base (une seule ligne sert les deux sens). `trajets.nom` est figé à la création ("Abidjan - Bouaké" par ex.) ; une agence à Bouaké qui vend vers Abidjan affichait quand même "Abidjan - Bouaké" au lieu de "Bouaké - Abidjan" partout où ce nom brut était utilisé tel quel. La ville de l'agence doit toujours apparaître à gauche.
- **Portée plus large que côté admin** : ce correctif touche aussi le **ticket imprimé remis au client** — `TicketRepository.avecDetails()` (utilisée par `VenteService.vendre()` pour construire le reçu) joignait `vd`/`va` directement sur `tr.ville_depart_id`/`tr.ville_arrivee_id` (le sens stocké du trajet), donc `ville_depart`/`ville_arrivee` sur le ticket papier pouvaient être inversés selon l'agence — corrigé en réancrant sur la ville réelle de l'agence (`agv.nom` = toujours le départ, le reste calculé par `CASE WHEN`).
- **Correctifs appliqués** (tous les endroits où un `tr.nom` brut était utilisé, agence par agence) :
  - `TrajetRepository.resoudreBidirectionnel()` : ne renvoie plus `trajets.nom`, reconstruit le nom à partir des villes réellement demandées (`villeDepartId` = toujours la ville de l'agence côté appelant) — alimente le label affiché pendant la vente (`trajetActuel.nom` dans `VenteForm.vue`).
  - `TicketRepository.avecDetails()` : `ville_depart_nom`/`ville_arrivee_nom` recalculés avec la ville de l'agence à gauche (voir ci-dessus, impact ticket imprimé).
  - `TicketRepository.ventesDuJour()` et `TicketRepository.rapportParVoyage()` : le libellé "trajet" (tableau des ventes du jour, fin de caisse par voyage) est reconstruit de la même façon.
  - `ReferentielRepository.tarifsAgence()` : idem pour le tableau des tarifs par agence (config).
- **Volontairement laissé tel quel** : `TicketRepository.parNumeroCourt()` a bien `ville_depart_nom`/`ville_arrivee_nom` déjà corrects (le pattern `CASE WHEN` existait déjà là — c'est en l'observant que le vrai correctif a été déduit), mais son champ `trajet_nom` brut reste inutilisé côté frontend (`BagageForm.vue` affiche `ville_depart_nom → ville_arrivee_nom`, pas `trajet_nom`) — laissé tel quel, aucun impact utilisateur.
- Vérifié : `npm run typecheck` + `npm run build` (electron-vite) OK. Voir `admin/PROGRESS.md` pour le même correctif côté admin (page Vente, tarifs) + un test de non-régression.

### Complément : même bug sur les itinéraires (21/07/2026)

- **Signalé par l'utilisateur** : `itineraires` a la même règle bidirectionnelle que `trajets` ("Abidjan-Man" et "Man-Abidjan" = le même itinéraire), avec le même défaut : `nom` figé à la création, affiché tel quel dans plusieurs écrans liés à "Voyage".
- **Bug supplémentaire découvert en creusant** : `ReferentielRepository.itineraires()` (liste servant à choisir un itinéraire lors de la création d'un voyage) ne filtrait même pas par agence — un chef de gare à Abidjan voyait TOUS les itinéraires du système, y compris ceux d'autres villes n'ayant rien à voir avec sa gare. Corrigé : la méthode prend maintenant `agenceId` en paramètre, ne renvoie que les itinéraires reliés à la ville de cette agence, réorientés avec cette ville toujours à gauche (donc jamais listée elle-même comme "destination", même principe que la vente de ticket et le courrier qui excluent déjà la ville de l'agence des destinations proposées). `VoyageService.formulaire()` passe désormais `agenceId`.
- **Autres correctifs** (même pattern `agv.nom || ' - ' || CASE WHEN ...`, agence toujours à gauche) : `VoyageRepository.liste()` (tableau "Voyages"), `VoyageRepository.disponiblesPourTrajet()` (libellé du voyage à la vente de ticket), `TicketRepository.voyagesDuJourAvecOccupation()` (sélecteur de voyage en fin de caisse), `ReferentielRepository.voyagesDeAgence()` (sélecteur de voyage pour bagage/courrier sans ticket).
- Vérifié : `npm run typecheck` + `npm run build` OK.

### Complément : reçus déjà corrects, destinations bagage/courrier corrigées (21/07/2026)

- **Reçus d'impression vérifiés un par un** : `TicketRecu.vue` (`ville_depart`/`ville_arrivee`) provient de `VenteService.vendre()` → `TicketRepository.avecDetails()`, déjà corrigé plus haut dans cette même vague. `FinDeCaisseRecu.vue` provient de `rapportParVoyage()`, déjà corrigé aussi. Aucun changement supplémentaire nécessaire ici — la correction backend suffit, le reçu imprimé hérite automatiquement du bon sens. `BagageRecu.vue`/`CourrierRecu.vue` affichent juste `destination` (une seule ville, stockée directement en `ville_arrivee_id` sur le bagage/courrier, sans passer par un trajet bidirectionnel) : jamais concernés par ce bug.
- **Vrai bug trouvé, différent** : le sélecteur "Destination" de `BagageForm.vue` et `CourrierForm.vue` listait **toutes** les villes sans exclure celle de l'agence — contrairement à la vente de ticket qui filtre déjà `villeDepartId`. Ajouté `villesDestinationsPossibles` (filtre sur `config.agence?.ville_id`) dans les deux formulaires, utilisé à la place de la liste brute dans les `SelectItem`.
- Vérifié : `npm run typecheck` + `npm run build` OK.

## Champs Timbre / Commission vides par défaut (22/07/2026)

- Demande : afficher "0" dans les champs Timbre/Commission (vente de ticket) obligeait à effacer avant de saisir — gênant à chaque vente. Les deux champs partent maintenant vides (`ref<number | ''>('')`, placeholder "0" pour le repère visuel), avec un computed dérivé (`timbreValeur`/`commissionValeur`, `Number(x) || 0`) utilisé partout où un nombre est réellement nécessaire (total à payer, envoi de la vente, dialog de confirmation) — un champ vide continue de valoir 0 dans tous les calculs, rien d'autre ne change.
- Vérifié : `npm run typecheck` + `npm run build` OK.

## Réinitialisation complète du poste (22/07/2026)

- Nouveau bouton **« Réinitialiser ce poste »** dans Paramètres, visible uniquement par un super admin (même emplacement que « Nettoyage local », section déjà réservée à ce rôle) — beaucoup plus destructeur que le nettoyage existant : contrairement à `nettoyerDonneesTest` (qui préserve explicitement licence/configuration/agents/utilisateurs/catalogue), celui-ci efface **tout** — les 18 tables de la base locale, `config` y compris (donc `agence_reference`, la licence locale, le réseau local...). Le poste redevient exactement comme un poste jamais configuré.
- `ConfigController.resetComplet(acteurUserId)` : même garde-fou que le nettoyage (`verifierSuperAdmin`), même structure (transaction, `foreign_keys = OFF` le temps de vider toutes les tables dans un ordre qui respecte les dépendances, purge de `sqlite_sequence`). Purement local : n'appelle jamais l'admin — une licence déjà assignée reste assignée côté admin (à libérer là-bas si elle doit être réattribuée à un autre poste).
- Après le reset, `window.location.reload()` recharge toute l'app JS (tous les stores Pinia repartent à zéro, y compris `config`/`session`) : le garde de navigation (`router/index.ts`) relit `estConfiguree()`, le trouve à `false` (plus d'`agence_reference` en base) et redirige automatiquement vers `/configuration` — le premier écran qui demande le numéro de gare et le numéro de poste. Pas de logique de redirection ajoutée à la main : c'est le mécanisme déjà en place (utilisé pour toute perte de configuration) qui s'en charge.
- Confirmation `window.confirm()` avec un message explicite sur l'irréversibilité et la perte des ventes non encore synchronisées avec l'admin.
- Vérifié : `npm run typecheck` + `npm run build` OK (chaîne complète : `ConfigController` → IPC → `preload` → `window.d.ts` → `Parametres.vue`).

## Bouton « Synchroniser vers admin » (22/07/2026)

- Ajouté juste à côté du bouton « Réinitialiser ce poste » (même section, réservée au super admin) : force un cycle de synchro tout de suite au lieu d'attendre le déclenchement automatique (au lancement, toutes les 30s s'il y a des éléments en attente, ou 300ms après un nouvel ajout) — utile après une coupure réseau, ou pour vérifier si la file est bloquée.
- `ConfigController.synchroniserMaintenant()` : appelle `syncEngine.runCycle()` (déjà public, jusqu'ici jamais déclenché manuellement) puis renvoie le nombre d'éléments encore en attente + le détail de la première erreur en attente s'il y en a une (nouvelle méthode `SyncQueueRepository.premiereErreurEnAttente()`).
- Ce diagnostic d'erreur a été ajouté suite à une discussion sur un risque déjà présent dans `SyncEngine` : une seule vente qui échoue avec une erreur inattendue (5xx, ni 401/403 ni "rejouable") stoppe tout le cycle (`statut: 'stop'` dans `classerErreur`), bloquant tout ce qui attend derrière elle jusqu'à ce que ce soit résolu. Le bouton ne corrige pas ce comportement (pas demandé, et le changer sans plus de contexte serait risqué), mais permet de voir immédiatement si c'est ce qui se passe (message "Ça bloque sur un(e) X : <erreur>") plutôt que d'attendre en silence.
- Vérifié : `npm run typecheck` + `npm run build` OK.

## Masquage Voyages/Tarifs/Véhicules/Chauffeurs si module ticket inactif (25/07/2026)

- Suite du réglage `modules_actifs` déjà en place côté admin (Compagnie) : si l'entreprise n'utilise pas le module ticket (ex : uniquement courrier), les écrans Voyages/Tarifs/Véhicules/Chauffeurs — purement liés aux voyages en bus, jamais utilisés par bagage/courrier — doivent aussi disparaître ici, pas seulement côté admin.
- **Constat de départ** : l'admin envoyait déjà `modules_actifs` dans `compagnie.toPayload()` à chaque bootstrap/rafraîchissement (`/api/desktop/bootstrap`), mais le desktop l'ignorait silencieusement — perdu à trois endroits : le type `CompagnieApi` (`electron/types/bootstrap.ts`), la boucle de seed vers la table `config` (`CatalogueRepository.seed()`), et le type `CompagnieLocale` + la lecture (`CompagnieRepository.actuelle()`).
- **Plomberie complétée** (chaîne complète, aucune couche sautée) : `CompagnieApi.modules_actifs: string[]` → `CatalogueRepository.seed()` écrit `compagnie_modules_actifs` (CSV) dans la table `config` → `CompagnieRepository.actuelle()` le relit et le parse (repli sur les 3 modules si absent — poste jamais synchronisé avec cette version, ou admin plus ancien) → `CompagnieLocale.modules_actifs` (`Stores/config.ts`) → nouvelle fonction `config.moduleActif('ticket'|'bagage'|'courrier')` sur le store.
- **`AppSidebar.vue`** : `exploitationNavItems` pousse Voyages/Tarifs/Véhicules/Chauffeurs uniquement si `config.moduleActif('ticket')` — distinct du filtrage déjà existant sur `mainNavItems` (`session.peutModule()`, qui vérifie l'accès de *l'agent*, pas le réglage de l'entreprise).
- **`router/index.ts`** : nouvelle liste `routesModuleTicket` (voyages/tarifs/vehicules/chauffeurs) + garde dans `beforeEach` qui redirige vers `dashboard` si `!config.moduleActif('ticket')` — ces 4 routes n'avaient jusqu'ici aucune garde du tout (contrairement à vente/bagages/courrier, déjà protégées par `moduleParRoute`), navigation directe par URL/hash possible sans ça.
- Vérifié : `npx vue-tsc --noEmit` et `npm run build` OK. Côté admin (même réglage `modules_actifs`), Itinéraires/Trajets/Tarifs/Voyages/Chauffeurs/Véhicules sont masqués dans `AppSidebar.vue` et bloqués par URL directe (`routes/config.php`, middleware `module:ticket`) selon le même principe — Villes/Agences/Agents restent toujours accessibles (utiles à tous les modules). Suite Pest admin **126 tests / 837 assertions** OK.

## Reçu courrier : code agence dép/dest + téléphone déjà bien placé (25/07/2026)

- Demande : afficher sur le reçu (et l'étiquette) le code de l'agence de départ et celui de l'agence de destination (`code_ticket`, ex : "YOP") — c'est ici, sur le desktop, que le reçu est réellement imprimé au guichet, pas côté admin. Le téléphone de l'entreprise était déjà positionné juste après le nom (`CourrierRecu.vue` ligne 51-56 avant modif) : rien à changer sur ce point côté desktop.
- **Trois flux distincts alimentent le même composant `CourrierRecu.vue`**, tous mis à jour en parallèle pour ne rien casser :
  1. **Enregistrement d'un nouveau courrier** (`CourrierForm.vue`) : `agenceActuelle` (= `config.agence`, déjà typé avec `code_ticket` côté `AgenceLocale`) donne le code de départ directement ; le code de destination manquait sur `agencesDestination` (`ReferentielRepository.agencesParVille()` ne sélectionnait pas la colonne) — corrigé (`AgenceOption.code_ticket` + `SELECT ... code_ticket`).
  2. **Réimpression d'un courrier déjà enregistré** (`Views/Courrier.vue` → `window.api.courrier.details()` → `CourrierRepository.details()`) : même trou, la requête SQL ne remontait pas `code_ticket` des agences jointes — ajouté (`aa.code_ticket AS agence_arrivee_code`, `ad.code_ticket AS agence_depart_code`).
  3. **`CourrierRecu.vue`** lui-même : props `agence_depart_code`/`agence_arrivee_code` ajoutées, affichées entre parenthèses à côté du nom d'agence — sur le reçu (bloc Expéditeur + bloc Bénéficiaire) et sur l'étiquette (bas de l'étiquette + ligne destination).
- Vérifié : `npx vue-tsc --noEmit` et `npm run build` OK (aucune erreur, y compris sur les 3 flux touchés). Côté admin, même ajout sur son propre reçu courrier (`CourrierController`/`CourrierRecu.vue`) — voir `admin/PROGRESS.md`. Suite Pest admin **126 tests / 839 assertions** OK.

## Reçu courrier imprimé : lisibilité + diagnostic du décalage (25/07/2026)

- Suite à une photo d'un reçu réellement imprimé : polices agrandies dans `CourrierRecu.vue` (desktop) pour une meilleure lisibilité au comptoir — base 13px→14px, nom compagnie 14px→16px, nom expéditeur/destinataire 13px→15px, lignes secondaires (contact, petites mentions, note, pied) 11px→12px.
- **Décalage horizontal (reçu pas centré) : investigué en détail, cause identifiée hors CSS.** Le PDF généré (`electron/ipc/index.ts::imprimerViaPdf`) est bien produit à exactement 80mm de large (`printToPDF({ pageSize: { width: 3.15, height: ... } })`, `@page { size: auto }` dans `app.css`) et `.ticket-recu` (70mm, `margin: 0 auto`) y est correctement centré — vérifié en relisant tout le pipeline, ce n'est pas un bug de mise en page Vue/CSS. Le décalage constaté sur papier se produit donc **après**, quand ce PDF de 80mm est envoyé à l'imprimante physique via SumatraPDF (`pdf-to-printer`) : si le format personnalisé `80mm x Hmm` n'est pas reconnu par le pilote de cette imprimante précise, l'impression retombe sur le "papier pilote" (taille par défaut configurée dans Windows) — si cette taille par défaut est plus large que 80mm, SumatraPDF place le contenu en haut à gauche de cette page plus grande au lieu de le centrer sur le vrai rouleau, d'où le grand blanc à droite constaté sur la photo. Cohérent avec la différence déjà observée entre postes sur ce modèle d'imprimante (pilote/réglages différents).
- Pas de changement de code sur ce point : la correction la plus sûre est de vérifier/aligner la taille de papier par défaut du pilote de cette imprimante (Windows, propriétés de l'imprimante) sur celle des postes qui impriment déjà bien centré — un changement de code (passer `scale: 'shrink'` à `'fit'` côté Windows) a été envisagé mais écarté : si le pilote pense avoir une page plus large que les 80mm réels, "fit" agrandirait le contenu jusqu'à déborder du vrai rouleau plutôt que de le recentrer, risque non vérifiable à distance sans le matériel physique.
- Vérifié : `npx vue-tsc --noEmit` et `npm run build` OK.

### Complément : coquille sur le dossier de logs + codes agence sur leur propre ligne (25/07/2026)

- **Coquille corrigée** dans `electron/logger/index.ts` : le dossier des logs était nommé `"l ogs"` (espace en trop) au lieu de `"logs"` — gênait la récupération du fichier `app.log` pour comparer les tentatives d'impression (`Chrono impression PDF/Sumatra`, voir entrée précédente) entre un poste qui imprime bien centré et un qui ne l'est pas.
- **Confirmé avec l'utilisateur** : le décalage touche uniquement le reçu courrier (pas ticket/bagage) et se produit sur le même poste/imprimante qui imprimait bien avant — cohérent avec le diagnostic déjà posé plus haut (repli du pilote sur une taille de papier autre que 80mm), pas avec un souci de mise en page propre au courrier.
- Par prudence, et même si le calcul de largeur ne montre pas de dépassement avec le texte actuel, les codes d'agence ajoutés dans l'entrée précédente sont passés d'un affichage entre parenthèses sur la même ligne (`Gare Adjamé (ADJ)`, dans une ligne flex `justify-content: space-between` partagée avec un autre libellé) à **leur propre ligne dédiée** (`Code agence : ADJ`) — sur le reçu (bloc Expéditeur et bloc Bénéficiaire) et sur l'étiquette (bas de l'étiquette, jusqu'ici partagé avec l'heure). Élimine tout risque de compression/débordement horizontal sur cette ligne précise, sans changer l'information affichée.
- Même changement appliqué côté admin (`CourrierRecu.vue`) pour rester cohérent entre les deux reçus.
- Vérifié : `npx vue-tsc --noEmit` et `npm run build` OK des deux côtés, suite Pest admin **128 tests / 855 assertions** OK.

### Complément : téléphone des agences dép/dest sur le reçu courrier (26/07/2026)

- Même besoin que le code agence (`code_ticket`) déjà ajouté : afficher aussi le numéro de téléphone de l'agence (`agences.telephone`, déjà synchronisé localement, juste jamais sélectionné dans ces requêtes) pour le départ et la destination.
- Mêmes trois flux mis à jour en parallèle que pour le code agence : `AgenceRepository.actuelle()` (départ, `config.agence`), `ReferentielRepository.agencesParVille()` (destination), `CourrierRepository.details()` (réimpression) — + les types miroirs côté renderer (`Stores/config.ts`, `types/window.d.ts`, `Views/Courrier.vue`, `CourrierForm.vue`).
- **`CourrierRecu.vue`** : nouvelle ligne "Tél agence : ..." juste après chaque ligne "Code agence : ..." déjà en place (même `.petit`/`.petit text-right` selon l'endroit) — reçu (bloc Expéditeur + bloc Bénéficiaire) et étiquette (ligne destination + bas de l'étiquette).
- Vérifié : `npx vue-tsc --noEmit` et `npm run build` OK.

### Complément : retrait du code agence sur le reçu (confidentiel) (26/07/2026)

- Le code agence (`code_ticket`) affiché sur le reçu/étiquette a été retiré à la demande de l'utilisateur — jugé confidentiel. Retiré proprement de bout en bout (pas juste caché côté template) : `AgenceRepository`, `ReferentielRepository`, `CourrierRepository.details()`, types miroirs (`Stores/config.ts`, `types/window.d.ts`), `CourrierForm.vue`, `Views/Courrier.vue`, `CourrierRecu.vue` (les 4 lignes "Code agence : ..."). Le nom de l'agence et son téléphone (ajoutés dans l'entrée précédente) restent affichés.
- La colonne `agences.code_ticket` en base n'est pas touchée — toujours utilisée pour préfixer les numéros de ticket/bagage/courrier (`codeAgenceTicket()` dans `CourrierRepository`/`TicketRepository`/`BagageRepository`, requêtes indépendantes non concernées par ce nettoyage).
- Vérifié : `npx vue-tsc --noEmit` et `npm run build` OK.
