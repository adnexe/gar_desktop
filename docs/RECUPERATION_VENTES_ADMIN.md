# Recuperation des ventes sauvegardees dans admin

## Utilisation

Dans Tickets, Bagages, Courrier ou Courrier international, le super administrateur
choisit une date puis clique sur **Recuperer les ventes**. Il confirme avec le mot
de passe de son compte super administrateur dans admin. Les autres roles ne voient
pas ce bouton et ne peuvent pas utiliser son appel IPC/API.

La recuperation concerne l'agence configuree sur le poste, pas une agence envoyee
par le formulaire. Elle exige Internet et un admin a jour. Aucune impression ni
nouvelle vente n'est declenchee.

Les lots/bordereaux du module sont recuperes par le meme bouton. Un lot du jour
ou contenant une vente du jour est importe avec tous ses envois, meme si certains
datent d'un autre jour. Les dates originales sont conservees, donc ces autres
ventes ne sont pas ajoutees aux chiffres de la date selectionnee.

## Protections

- Route POST `/api/desktop/recuperation`, jeton d'agence et verification en ligne
  du mot de passe d'un compte actif `super_admin`. Limite : 6 demandes/minute
  par agence et adresse IP. La reponse ne contient aucun mot de passe ni jeton.
- La session desktop authentifiee doit encore etre ouverte a la fin du transfert.
- Telechargement complet puis transaction SQLite unique avec cles etrangeres
  actives. En cas d'erreur, aucun ajout partiel n'est conserve.
- Identite des ventes/lots par UUID. Les IDs SQLite des operations sont locaux;
  les relations sont reconstruites avec les UUID et une correspondance des IDs
  admin vers les IDs locaux. Les IDs des referentiels et agents restent ceux
  d'admin, comme dans le catalogue existant.
- Les lignes deja presentes ne sont pas ecrasees. Clients dedoublonnes par UUID
  puis telephone normalise ET source (ticket/courrier). Un client local existant
  garde son UUID et ses donnees.
- Collision de numero, de place occupee ou d'affectation a un autre lot : arret
  et rollback. Aucun renumerotage ni deplacement automatique d'un envoi.
- Les lots locaux modifies/en attente ne sont pas ecrases. Les liens manquants
  sont ajoutes seulement pour les lots nouveaux ou de meme version temporelle.
  Sinon la recuperation s'arrete : elle ne laisse pas un envoi retrouve sans
  son rattachement au lot. Meme protection pour les colis d'un courrier modifie.
- Les comptes absents necessaires aux anciennes ventes sont inseres inactifs,
  sans mot de passe utilisable. Une recuperation ne reactive aucun acces.
- Les donnees importees sont acquittees dans `sync_queue`, jamais ajoutees aux
  envois en attente. Cela evite notamment la reprogrammation automatique des lots.
  Une modification ulterieure normale d'un lot garde sa synchronisation habituelle.
- Les compteurs des numeros sont avances jusqu'au maximum connu d'admin pour
  les prefixes de l'agence, y compris les autres dates. Ils ne reculent jamais.
  Une vente non sauvegardee dans admin ne peut pas etre restauree par cet outil.
- Trace `recupere_admin_at` sur les ventes/lots nouveaux et journal de resultat
  dans les logs desktop. Aucun mot de passe dans les logs.

## Poste client et caisse serveur

La restauration ecrit sur le poste qui la demande. Elle ne change pas son mode.
Un poste autonome/serveur retrouve les ventes dans ses listes et fins de caisse
habituelles. Sur un poste client, la section Tickets propose un choix entre
les ventes de la caisse serveur et les ventes recuperees sur ce poste. La fin
de caisse utilise la meme source que la liste, sans additionner les deux.
Les nouvelles ventes de tickets continuent a passer par la caisse serveur.
Pour reparer la base centrale et ses places, lancer la recuperation sur cette
caisse serveur, pas uniquement sur les clients.

## Deploiement et tests

- Deployer le code admin et reconstruire desktop. Pas de migration admin nouvelle.
- Migration SQLite `0022_trace_recuperation_admin`, appliquee au lancement.
- `cd admin` puis `php artisan test --compact --filter=DesktopRecoveryTest`.
- `cd desktop` puis `node tests/recovery-import.mjs` : genere les snapshots via
  les tests Laravel en base SQLite de test, puis importe dans une base SQLite
  en memoire. Ne touche pas aux donnees de production/locales de l'application.
- `node tests/recovery-service.mjs` : droits, hors ligne, double clic,
  deconnexion pendant le transfert et absence de mot de passe dans les logs.
- `node tests/recovery-ui.mjs` : bouton reserve au super administrateur dans
  les quatre sections, avec la date de leur filtre.

Schema de transfert version 1. Limites : 20 000 ventes selectionnees, 50 000
lignes liees et 64 Mo. Au-dela, arret explicite, jamais un export tronque.
