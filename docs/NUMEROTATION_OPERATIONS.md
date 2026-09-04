# Numerotation des operations Desktop

## Objectif

Chaque numero cree hors ligne doit rester unique entre les postes et ne doit
jamais etre reutilise apres une reinstallation ou une reconfiguration.

Le format repose sur :

- le code agence sur 3 caracteres ;
- le numero de poste sur 3 chiffres, attribue par la licence ;
- un compteur propre a la categorie sur 6 chiffres.

Exemple pour l'agence `ADJ`, poste `002` : `ADJ002000155`.

## Formats

| Operation | Format |
| --- | --- |
| Ticket | `ADJ002000155` |
| Bagage | `ADJ002000046` |
| Courrier national | `ADJ002000033` |
| Courrier international | `ADJ002000067` |
| Lot courrier | `BE-ADJ002000013` |
| Lot bagage | `BB-ADJ002000008` |
| Lot international | `BI-ADJ002000005` |
| Convoi | `CNV-ADJ002000090` |

Les compteurs sont independants. Deux categories peuvent donc avoir le meme
suffixe sans collision, car leur numero ou leur prefixe complet differe.

## Reprise apres reinstallation

Lors de la configuration puis a chaque actualisation du catalogue :

1. Desktop envoie la reference de l'agence et le numero du poste a l'admin.
2. L'admin calcule et renvoie le plus grand compteur connu pour chaque
   categorie et ce poste uniquement.
3. Desktop compare ce plancher avec son compteur local et ses operations
   locales.
4. Desktop conserve toujours la plus grande valeur. Un compteur ne recule
   jamais.

L'admin memorise aussi le plus grand numero recu par synchronisation dans
`desktop_operation_counters`. Ce plancher reste disponible meme si une ancienne
operation est ensuite supprimee.

## Regles de securite

- Une vente est refusee si le code agence ou le numero de poste manque.
- Un numero prepare pour l'impression n'est accepte que s'il correspond au
  prochain compteur attendu. Un ancien cache est ignore.
- Le nettoyage des donnees de test conserve les compteurs.
- Une reinitialisation complete efface la base locale, mais la prochaine
  configuration reprend les compteurs depuis l'admin avant toute vente.
- La reference complete d'un lot est son identifiant unique. Le numero de lot
  seul peut etre identique sur deux postes differents.

## Deploiement

Deployer l'admin et executer sa migration avant de distribuer la nouvelle
version Desktop :

```bash
php artisan migrate --force
```

Une ancienne version de l'admin ne renvoie pas `compteurs_operations` ; la
nouvelle application Desktop bloque alors la configuration au lieu de demarrer
avec un compteur incertain.
