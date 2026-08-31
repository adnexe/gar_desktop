# Lots et bordereaux locaux (desktop)

## Objectif

Le module regroupe plusieurs courriers nationaux, courriers internationaux ou
bagages dans un lot local avant leur expédition. Un bordereau est toujours
imprimé depuis un lot enregistré : il ne reprend plus arbitrairement toutes les
opérations d'une journée.

Les lots sont créés et imprimés sur le poste desktop, puis envoyés à l'admin par
la file de synchronisation existante. L'UUID du lot et les UUID de ses éléments
sont conservés de bout en bout.

## Parcours utilisateur

1. Ouvrir `Courrier`, `Courrier international` ou `Bagages`, puis cliquer sur
   `Bordereaux`.
2. Ouvrir `Nouveau lot`.
3. Choisir un groupe `destination + voyage`.
4. Sélectionner les opérations à regrouper.
5. Confirmer la création du lot.
6. Consulter ou imprimer le bordereau depuis `Lots enregistrés`.
7. Utiliser `Étiquette` pour imprimer l'identification thermique à coller sur
   le lot.
8. Utiliser `État des lots` pour imprimer la synthèse de tous les lots du
   module et de la date affichée.
9. Tant que le lot est `En préparation`, ouvrir ses détails, sélectionner un ou
   plusieurs éléments et utiliser `Retirer du lot`. Les éléments retirés
   redeviennent disponibles pour un autre lot.
10. Faire avancer le lot dans l'ordre :
   `En préparation` -> `Expédié` -> `Arrivé` -> `Livré`.

Les changements de statut sont irréversibles dans cette version. Une
confirmation est demandée avant la création et avant chaque changement.

## Numérotation

- `numero_lot` est un compteur lisible, séparé par agence et par type. Une
  agence peut donc avoir `LOT N° 1` dans chacun des trois modules.
- `reference` est l'identifiant humain du bordereau :
  - courrier : `BE-<agence><poste><compteur>` ;
  - courrier international : `BI-<agence><poste><compteur>` ;
  - bagage : `BB-<agence><poste><compteur>`.
- Exemple : `BE-ADJ001000045` désigne un bordereau courrier de l'agence `ADJ`,
  produit sur le poste `001`, pour le lot courrier n° 45.
- L'UUID v7 de `lots_bordereaux.uuid` reste l'identifiant technique canonique.

Le code agence et le code poste évitent qu'une future centralisation fusionne
deux références créées par des postes différents.

## Modèle SQLite

Migration : `0018_lots_bordereaux_locaux`.

### `lots_bordereaux`

Contient l'entête métier du lot : UUID, type, agence, numéro, référence, date,
destination, voyage, statut, créateur et dates de progression.

Contraintes principales :

- type limité à `courrier`, `courrier_international` ou `bagage` ;
- statut limité aux quatre statuts du workflow ;
- référence unique ;
- numéro de lot unique pour `(agence_id, type)`.

### `lot_courriers`

Table de liaison entre un lot courrier et les lignes de `courriers`.
`courrier_id` est unique : un courrier ne peut appartenir qu'à un seul lot.

### `lot_bagages`

Table de liaison entre un lot bagage et les lignes de `bagages`.
`bagage_id` est unique : un bagage ne peut appartenir qu'à un seul lot.

### `lot_courriers_internationaux`

Table de liaison entre un lot international et les lignes de
`courriers_internationaux`. `courrier_international_id` est unique : un envoi
international ne peut appartenir qu'à un seul lot.

Les ventes et leur comptabilisation ne sont jamais modifiées lors de la
création, de l'impression ou du changement de statut d'un lot.

## Règles métier et sécurité

- Seules les opérations payées/enregistrées sont éligibles.
- Une sélection doit contenir une seule destination et un seul voyage.
- Une opération déjà liée à un lot disparaît de la liste des éléments
  éligibles et la contrainte SQLite bloque également un doublon direct.
- Un agent ordinaire ne voit, ne regroupe et ne modifie que ses opérations et
  ses lots.
- Le chef de gare voit les lots de son agence.
- Les rôles `admin` et `super_admin` peuvent consulter les lots accessibles au
  poste et à l'agence sélectionnée.
- Les contrôles sont faits dans `LotService`, pas seulement dans Vue : un appel
  IPC construit manuellement ne contourne pas ces règles.

## API IPC locale

Le preload expose `window.api.lots` :

- `lister(params)` ;
- `eligibles(params)` ;
- `creer(params)` ;
- `details(uuid, userId)` ;
- `changerStatut(uuid, statut, userId)`.

Les contrôleurs renvoient toujours `{ ok, data?, erreur? }` afin de ne pas
laisser l'interface bloquée sur une promesse rejetée.

Les valeurs envoyées au preload doivent être des objets JavaScript natifs. Une
`ref` ou un objet réactif Vue est un `Proxy` que le mécanisme de clonage IPC
d'Electron refuse avec `An object could not be cloned`. Pour une sélection,
envoyer par exemple `elementUuids: [...selection.value]`. Le test de régression
se lance avec `npm run test:lot-ipc`.

## Synchronisation vers l'admin

- Entité de file : `lots_bordereaux`.
- Une création ajoute une opération `create` ; chaque progression de statut
  ajoute une opération `update`.
- La migration locale `0020_synchroniser_lots_bordereaux` place aussi les lots
  créés avant cette mise à jour dans la file, une seule fois.
- Le payload contient l'entête du lot et `element_uuids`. Aucun identifiant
  SQLite local n'est envoyé.
- L'admin attend que toutes les ventes liées existent. Si une dépendance manque,
  il répond `409` avec `retryable: true` et le desktop réessaie automatiquement.
- L'import est idempotent par UUID. Une même opération ne peut pas appartenir à
  deux lots, même si une requête est rejouée.
- Un statut déjà plus avancé dans l'admin ne régresse jamais lors d'un nouvel
  envoi desktop.

Dans l'admin, la page `Bordereaux` permet de filtrer par agence, date, type,
statut et recherche, d'ouvrir les détails et d'imprimer le bordereau A4. Un
admin simple consulte seulement ; le super admin peut faire avancer le statut.

## Impression

Le composant `BordereauA4.vue` reçoit les informations du lot enregistré :
numéro, référence, destination, voyage et lignes. Le nom et le logo de la
compagnie sont relus depuis la configuration locale avant l'impression.

L'impression utilise `window.print()` : elle ouvre la boîte de dialogue
classique, ne passe pas par le service silencieux des imprimantes thermiques et
ne modifie pas leur calibration. Avant le dialogue, `Imprimer` et `État des lots`
demandent le format **A4** ou **POS**. Annuler ce choix ne lance aucune impression.

- A4 : tableau actuel, papier 210 x 297 mm et marges de 10 mm, sans changement.
- POS : les envois (ou les lots pour l'état) deviennent des blocs verticaux avec
  les mêmes références, noms, téléphones, contenus, montants et totaux. Les longs
  textes reviennent à la ligne ; aucun tableau A4 n'est simplement réduit.
- La largeur POS vient des réglages locaux d'impression (80 mm par défaut,
  compatible 58 mm). La largeur du contenu et le décalage local sont repris,
  bornés à la largeur du papier. Les réglages sauvegardés ne sont pas modifiés.
- La hauteur est mesurée sur la mise en page POS. Au-delà d'un mètre, le document
  est paginé plutôt que tronqué. Le pilote peut imposer ses propres dimensions :
  choisir aussi le papier approprié dans le dialogue si nécessaire.
- Les styles de page temporaires et les documents montés sont nettoyés après
  fermeture du dialogue, y compris en cas d'erreur. Un succès signifie seulement
  que le dialogue a été appelé, pas qu'une sortie physique a été confirmée.

Ces règles concernent courrier national, international et bagages. Elles restent
isolées des reçus de vente, talons, fins de caisse et étiquettes thermiques.

L'étiquette du lot est indépendante du bordereau A4. Elle utilise le circuit
thermique local et sa calibration par poste via `imprimerRecu()`. Elle contient
le nom et le logo disponibles, le numéro et la référence du lot, le trajet, le
voyage, la date, le nombre d'éléments, le statut, l'agence et le créateur. Aucun
montant financier n'est imprimé sur l'étiquette collée au lot.

L'état des lots regroupe tous les bordereaux de la date et du module courants. Il
affiche les références, destinations, voyages, statuts, créateurs, quantités et
montants, puis les totaux de la période. Comme le bordereau individuel, il ouvre
la boîte de dialogue d'impression classique.

## Fichiers principaux

- `electron/database/migrations/index.ts`
- `electron/repositories/LotRepository.ts`
- `electron/services/LotService.ts`
- `electron/controllers/LotController.ts`
- `electron/ipc/index.ts`
- `electron/preload.ts`
- `src/Components/lots/GestionLotsDialog.vue`
- `src/Components/lots/EtiquetteLot.vue`
- `src/Components/lots/EtatLotsA4.vue`
- `src/Components/BordereauA4.vue`
- `src/lib/impressionA4.ts`
- `src/assets/bordereaux-pos.css`
- `src/Components/lots/FormatBordereauDialog.vue`
- `src/types/lot.ts`

Tests : `node tests/bordereaux-formats.mjs`. Aperçu de test sans imprimante ni
base réelle : `node tests/bordereaux-preview-server.mjs` (port 5192, paramètres
`?type=bagage&papier=58` pour les autres cas).

## Limites volontaires

- Le retrait d'éléments est permis uniquement avant l'expédition. Un lot doit
  toujours conserver au moins un élément.
- Pas d'annulation ni de suppression de lot.
- Pas de réception croisée par une autre machine.
- La synchronisation des lots reste à sens unique, du desktop vers l'admin.
