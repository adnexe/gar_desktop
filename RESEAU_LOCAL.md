# Reseau local gare

Ce mode sert aux gares qui ont deux ordinateurs ou plus :

- la machine caisse/ticket devient le serveur local ;
- les machines bagage/courrier deviennent des postes clients ;
- toutes les ventes passent dans la base SQLite de la caisse serveur ;
- la synchronisation vers l'admin central part ensuite depuis cette base unique.
- chaque machine garde sa propre licence desktop.

Avant d'activer ce mode, configurer et licencier chaque ordinateur avec la reference de l'agence.

## 1. Machine caisse

1. Ouvrir l'application desktop.
2. Se connecter.
3. Aller dans `Parametres`.
4. Dans `Caisse serveur`, garder le port `3750` ou choisir un autre port.
5. Cliquer sur `Activer comme serveur`.
6. Noter :
   - une adresse du type `http://192.168.1.20:3750` ;
   - le `Code reseau`.

La machine caisse doit rester allumee et connectee au reseau local pendant le travail des autres postes.

## 2. Poste bagage ou courrier

1. Ouvrir l'application desktop sur le deuxieme ordinateur.
2. Se connecter.
3. Aller dans `Parametres`.
4. Dans `Poste client`, renseigner :
   - l'adresse affichee sur la caisse ;
   - le code reseau affiche sur la caisse.
5. Cliquer sur `Tester`.
6. Si le test reussit, cliquer sur `Utiliser`.

Apres cela, les recherches de ticket, ventes ticket, bagages, courriers, voyages et historiques passent par la caisse serveur.
Le poste client garde sa propre licence, mais les donnees de vente sont ecrites sur la caisse serveur.
Les voyages crees sur la caisse serveur sont lus par les postes clients dans les ecrans `Voyages`, `Bagages` et `Courrier`.

## 3. Mode autonome

Utiliser `Mode autonome` seulement si la machine doit retravailler avec sa propre base locale.

Attention : ne pas utiliser deux machines en mode autonome dans la meme gare pour vendre en meme temps, sinon les donnees ne seront plus dans une seule base locale.

Dans `Parametres`, les badges indiquent l'etat :

- `Caisse serveur ON` : cette machine accepte les postes clients.
- `Poste client ON` : cette machine demande les infos a la caisse serveur et enregistre les operations dessus.
- `Mode autonome ON` : cette machine ne se connecte pas a une caisse serveur locale.
- `Réseau local OFF` : aucun mode serveur/client n'est actif.

Quand `Poste client ON` est actif, le bouton `Deconnecter de la caisse serveur`
repasse la machine en mode autonome et efface l'adresse/code de la caisse serveur.

## 4. Points a verifier si le poste client ne se connecte pas

- Les deux machines sont sur le meme Wi-Fi ou le meme reseau cable.
- L'adresse IP de la caisse n'a pas change.
- Le port choisi est autorise par le pare-feu Windows.
- L'application desktop est ouverte sur la caisse serveur.
- Le code reseau est exactement le meme.
