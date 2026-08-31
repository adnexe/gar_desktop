# Adresse admin configurable par poste

## Utilisation

- Premier lancement : champ **Adresse admin** sur **Configuration de l'agence**,
  avec la reference agence et le numero de poste. Saisir l'URL du site, par
  exemple `https://admin.exemple.com`, sans `/api` ni page de connexion.
- Poste deja configure : **Parametres > Connexion a admin**. Tous les comptes
  peuvent lire l'adresse ; seul un super administrateur connecte peut la changer.
- Le changement prend effet pour les appels suivants, sans rebuild et sans
  redemarrage. Une mise a jour initiale de l'application reste necessaire pour
  installer cette fonctionnalite (relancer completement Electron en dev).
- Utiliser HTTPS en production. HTTP reste accepte pour les serveurs locaux.

## Stockage et compatibilite

La table SQLite `config` contient la cle `admin_url`. Aucun changement de schema
ni migration admin n'est necessaire. Sans cette cle, l'ancienne valeur compilee
`GAR_API_URL` reste utilisee, avec `http://127.0.0.1:8000` en dernier recours.
L'URL enregistree reste prioritaire apres les prochaines mises a jour.
Une suppression de la base locale/reinitialisation complete efface ce reglage.
La reinitialisation automatique d'une agence supprimee conserve l'adresse.

## Garde-fous

- URL HTTP/HTTPS seulement, pas d'identifiants dans l'URL, ni query/fragment.
- Au premier reglage, l'adresse est sauvegardee avant la demande de licence ;
  les verifications habituelles de licence et de catalogue restent en place.
- Sur un poste configure, une verification sur la nouvelle URL utilise le
  bootstrap existant, sans envoyer l'ancien jeton ni un mot de passe. Pas de
  redirection HTTP acceptee lors de cette verification. Utiliser l'URL finale.
- La reference, l'UUID **et l'ID** de l'agence doivent correspondre. L'agence
  doit etre active. Cela permet de changer le domaine d'un meme admin, pas de
  fusionner deux bases differentes. Pour migrer un serveur, conserver sa base.
- L'adresse et le nouveau jeton sont enregistres dans une transaction locale.
  Aucun catalogue n'est importe pendant cette verification. Ventes, files de
  synchronisation, licence, reseau local et impressions restent inchanges.
- Session et droits revalides apres la verification. Echec reseau, mauvaise
  agence ou deconnexion : ancienne adresse et ancien jeton conserves.
- Le changement est serialise avec le catalogue et le changement de mot de
  passe. Une reponse en vol de l'ancienne URL est refusee si l'URL a change,
  notamment pour eviter une invalidation de licence depuis l'ancien serveur.
  Les envois interrompus suivent la politique de reprise existante.
- La verification cree un jeton via le bootstrap admin existant. Elle ne
  reattribue pas la licence. La licence est recontrolee au check-in habituel.

## Perimetre technique

`electron/apiClient/adresse.ts` normalise et relit l'adresse locale.
`electron/apiClient/index.ts` utilise cette adresse pour le bootstrap, licence,
sync des ventes/lots/comptes, presence, recuperation et mot de passe.
`AdminAdresseService.ts` protege les modifications depuis l'IPC.
L'adresse de la caisse serveur LAN et l'URL electron-updater restent distinctes.

Tests : `node tests/admin-adresse.mjs` (SQLite en memoire, reseau simule),
`node tests/profile-password.mjs`, puis `npm run build`.
