# Impression des convois

Depuis septembre 2026, les deux actions de `Views/Convois.vue` utilisent le
format POS, pas les anciens composants A4.

- Mode `bordereau` de `Components/convoi/ConvoiRecu.vue` : informations du
  convoi, agent, depart/retour et toutes les lignes passagers. Aucun montant.
- Mode `caisse` : memes informations, nombre de places, montant fixe et
  emplacements de signature. Pas de liste passagers.
- Pipeline commun : `.zone-impression` / `.ticket-recu`, mesure par
  `hauteurZoneImpressionMm()`, puis `window.api.impression.imprimerRecu()`.
- Papier, largeur du contenu et decalage viennent du calibrage local existant.
- Un seul document monte a la fois; verrou pendant l'impression; erreur IPC
  affichee; nettoyage dans `finally`. Aucune mutation de vente ou de sync.
- Les longs bordereaux peuvent continuer sur plusieurs pages POS. Les lignes
  passagers ne sont pas coupees entre deux pages et l'entete du tableau se repete.

Verification : `node tests/convoi-impression-pos.mjs` et `npm run build`.
Test Chromium facultatif : generer les fixtures avec
`CONVOI_VISUAL_DIR=/tmp/gar-convoi-pos node tests/convoi-impression-pos.mjs`,
puis lancer `node tests/convoi-pos-visuel.mjs` avec Playwright disponible
(`PLAYWRIGHT_MODULE` permet de choisir son emplacement).

Tests effectues avec 200 places, libelles longs et calibrages 80/70/-4,
80/76/0, 57/48/0, 70/70/0. La sortie physique reste a verifier sur imprimante.
