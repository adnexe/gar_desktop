# Suivi des postes et des sessions

## Perimetre

Admin : **Exploitation > Suivi des postes** (`/postes`). Lecture pour admin et
super_admin ; chef_gare limite a son agence ; aucun acces pour une caissiere.
Les filtres agence, appareil, etat et date n'agissent pas sur les ventes.

Les postes sont regroupes par agence, avec une carte compacte par installation :
etat actuel, agent (ou dernier agent connu), premiere connexion de la journee,
temps connecte cumule et dernier contact. La premiere connexion vient de la
premiere periode `session` du jour, pas de l'ouverture du logiciel. Sans session,
la carte affiche **Aucune connexion**.
Un clic sur la carte ouvre un panneau lateral avec toutes les informations :
ordinateur, resume du jour, connexion, licence et historique complet. Ce panneau
defile independamment, garde son titre et le bouton Fermer visibles et suit les
actualisations par UUID du poste. Un changement de filtre ferme le detail.
Ce changement de presentation ne modifie ni le suivi local ni la synchronisation.

Chaque installation configuree envoie directement a l'admin, qu'elle soit
autonome, serveur ou cliente. Aucun relais par la caisse serveur locale.
Le numero de poste vient de `licence_code_poste`. Un UUID d'installation durable
(`suivi_installation_uuid` dans config) evite de confondre deux installations
ayant reutilise une licence. Le suivi commence apres installation de cette
version et configuration de l'agence : il ne reconstitue pas les jours anterieurs.

## Signification des indicateurs

- Signal admin toutes les 60 secondes, plus lancement, connexion, deconnexion,
  veille/reprise et fermeture. Delai maximal d'une requete normale : 5 secondes.
- Apres 90 secondes sans signal : **Injoignable / activite inconnue**. Cela ne
  prouve NI une coupure Internet NI un arret du travail : l'admin peut etre
  indisponible et la caisse peut travailler hors ligne.
- **Page de connexion** : application ouverte sans session agent.
- **Session ouverte** : compte authentifie et signal du renderer datant de
  moins de 90 secondes. Ce signal ne peut pas creer une session sans connexion.
- Une fenetre reduite continue de compter ; la veille ne compte pas.
- Une fermeture explicitement recue reste affichee comme **Application fermee**.
- Les durees representent l'ouverture de l'application et des sessions, pas le
  temps de travail productif, la presence physique ou le nombre de ventes.
- La licence affichee est l'etat reel en base admin. Le suivi ne renouvelle ni
  ne reactive une licence et ne remplace pas les controles d'acces existants.
- L'horloge affichee est celle du poste au dernier signal, avec son fuseau. Un
  decalage superieur a 5 minutes avec l'admin est signale. Les derniers contacts
  sont affiches en heure d'Abidjan et leur fraicheur vient de l'horloge admin.

## Stockage local et reprise

`suivi_poste_periodes` conserve une periode application et une periode session,
avec UUID, agence, installation, jour, horloges locales, duree, acteur, revision
et revision acquittee. Pas de ligne par minute : une periode est mise a jour
toutes les 30 secondes et aux transitions. L'acteur historique contient le
UUID agent, le UUID du compte et un nom de secours si le compte est supprime.
Les ventes, impressions et la file de synchronisation des ventes ne changent pas.

La duree utilise `performance.now()`, pas la soustraction des heures Windows.
A minuit les periodes sont separees entre les deux dates locales. Si l'horloge
change de facon incoherente, ou si plus de 90 secondes se passent entre deux
points, l'intervalle manquant n'est pas compte. Une nouvelle periode reprend.
Apres un crash/coupure electrique, les periodes restees ouvertes sont fermees
au dernier point durable avec `fermeture_estimee=true`. On ne compte pas la nuit
jusqu'au redemarrage. Une fermeture normale est enregistree avant l'appel reseau
final (timeout 1,5 seconde) ; si cet appel echoue, elle part au prochain lancement.

La table est un historique persistant, pas un cache a vider a la deconnexion.
Ne pas copier une base configuree sur plusieurs postes : les UUID d'installation
et les identifiants de licence doivent rester propres a chaque installation.
Une reinitialisation complete change l'identite du poste ; ce n'est pas une
simple deconnexion et ne doit pas servir a vider un historique non envoye.

## Protocole admin

`POST /api/desktop/presence`, authentification Sanctum avec le jeton agence deja
utilise par le desktop. Le couple licence/numero de poste doit appartenir a
l'agence du jeton. Une licence supprimee est seulement acceptable pour une
installation deja connue de cette meme agence.

Tables admin : `postes`, `poste_periodes`. Unicite installation et UUID periode.
La sequence du signal empeche une ancienne requete de remplacer un etat recent.
Les periodes ne sont remplacees que par une revision plus recente, avec controles
de proprietaire, de dates et de non-reouverture d'une periode fermee.
La reponse acquitte chaque UUID/revision ; une modification locale survenue
pendant l'envoi reste donc en attente. Les lots de 100 periodes sont rattrapes
au fil des cycles. Les erreurs restent dans les journaux, sans bloquer la vente.

L'API enregistre un suivi declare par une installation authentifiee, pas une
preuve inviolable de presence. Le module est en lecture seule et ne donne aucun
droit de vente ou de modification de comptes.

## Deploiement et verification

1. Deployer admin et lancer `php artisan migrate --force`.
2. Distribuer la mise a jour et relancer l'application sur chaque poste.
   Verifier l'adresse admin dans la configuration du poste ou ses parametres.
3. Ouvrir le suivi dans l'admin. Un poste apparait au premier signal recu.
4. Tester connexion, reduction, deconnexion, fermeture, travail hors ligne puis
   retour reseau. Une fermeture brutale ne devient estimable qu'au redemarrage.

Tests automatises :

```sh
# desktop
node --experimental-strip-types tests/suivi-poste.mjs
node tests/suivi-poste-service.mjs
# admin
php artisan test --filter=PosteSuiviTest
```

Ils couvrent connexion/deconnexion, journee a minuit, horloge reculee, veille,
crash, durees hors ligne, rattrapage SQLite, acquittement concurrent, isolation
des agences, anciennes sequences, licences desactivees/supprimees et droits.
