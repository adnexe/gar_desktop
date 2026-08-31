# Profil et mot de passe desktop

Le menu du compte, en bas de la barre laterale, propose **Profil** avant
**Se deconnecter**. Tous les utilisateurs connectes y ont acces. Le profil
affiche les informations existantes en lecture seule. Seul le mot de passe
est modifiable avec son mot de passe actuel et une confirmation du nouveau.

## Enregistrement

- Internet et une reponse d'admin sont obligatoires ; pas de changement differe.
- L'identite vient de la session authentifiee du processus Electron principal,
  jamais d'un user_id choisi par l'interface.
- `POST /api/desktop/profil/mot-de-passe` utilise le jeton d'agence du poste,
  verifie l'agence active, le compte actif, l'agent actif et son rattachement.
  Les comptes globaux admin/super_admin peuvent changer leur propre secret.
- Le mot de passe actuel est verifie par admin, meme si le hash local est ancien.
- Nouveau mot de passe : 8 caracteres minimum, 72 octets maximum pour bcrypt,
  different de l'ancien, confirmation identique, aucun caractere nul.
- Admin verrouille la ligne utilisateur dans une transaction, enregistre le
  hash et renouvelle remember_token. Seules l'identite et la date de mise a jour
  sont renvoyees, pas de secret. L'audit ne contient aucun mot de passe ou hash.
- Electron calcule son hash local et l'enregistre uniquement apres confirmation.
  Aucun mot de passe n'est place dans sync_queue, les journaux ou un fichier.
- Un verrou commun aux lectures de catalogue et a cette operation empeche une
  ancienne reponse de catalogue d'ecraser le nouveau mot de passe local. Les
  ventes et impressions ne prennent pas ce verrou.
- Le changement passe directement du poste vers admin, y compris en mode client.
  Les autres postes prennent le nouveau hash lors de leur actualisation habituelle.
  Un poste hors ligne conserve donc son dernier mot de passe connu jusque-la.

## Interruptions

Deux bases distantes ne peuvent pas etre validees dans une seule transaction.
Si admin enregistre mais que sa reponse se perd, le message indique que le
resultat est incertain. Se reconnecter en ligne avec le nouveau mot de passe
declenche la recuperation du catalogue et remet le poste a jour.

Si l'ecriture SQLite echoue apres confirmation, un message distinct indique que
le changement est fait dans admin mais doit encore etre recupere localement.
Si la session change pendant l'appel, seul le compte d'origine recoit le hash
confirme (comparaison id + UUID). Aucun compte n'est reactive ni recree.

Les champs sont effaces apres envoi et a la fermeture de la page. Aucune vente,
relation agent, licence ou configuration d'impression n'est modifiee.

## Livraison et tests

Deployer l'API admin puis reconstruire et redemarrer completement Electron.
Pas de migration supplementaire pour cette fonctionnalite.

```sh
# admin
php artisan test --filter=DesktopPasswordTest
# desktop
node tests/profile-password.mjs
npm run build
# Apercu visuel avec comptes fictifs, sans aucun appel aux bases reelles
node tests/profile-preview-server.mjs
```
