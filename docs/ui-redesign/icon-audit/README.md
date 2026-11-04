# YOUMBIA — Audit des icônes (04/11/2026)

## État
15 SVG Lucide originaux enregistrés sur branche d'audit, sans modification de composants, de backend ou de production. Ni la validation iPhone, ni la conformité aux catégories exactes de YOUMBIA ne sont acquises.

## Prévisualisation
Ouvrir `preview.html` après récupération du dossier ; les SVG locaux s'affichent sans CDN ni dépendance JS.

| Catégorie illustrative | SVG |
|---|---|
| Téléphones | smartphone.svg |
| Voitures | car-front.svg |
| Motos et vélos | bike.svg |
| Immobilier | house.svg |
| Mode | shirt.svg |
| Maison | sofa.svg |
| Informatique | laptop.svg |
| Jeux | gamepad-2.svg |
| Enfants | baby.svg |
| Emploi | briefcase-business.svg |
| Services | wrench.svg |
| Alimentation | shopping-basket.svg |
| Santé | heart-pulse.svg |
| Formation | graduation-cap.svg |
| Boutiques | store.svg |

Attention : ce mapping reste provisoire, en particulier `bike` ne couvre pas exactement moto.

## Critères GO 9,5/10
- Lisibilité à 24/28/32 pt sur iPhone réel ; labels et contraste accessibles.
- Qualité graphique homogène et correspondance aux vrais intitulés/IDs des catégories.
- Test iPhone en thème et dimension réels, sans régression de scroll.
- Contrôles TypeScript, lint, tests ciblés, bundle Expo et aucune nouvelle dépendance inutile.

## Licences
Sources : https://github.com/lucide-icons/lucide/tree/main/icons . Notice officielle conservée dans `LUCIDE-LICENSE.txt` (ISC et licences MIT Feather). Conserver la notice lors de la redistribution.

## Noun Project
La collection Shopping Categories est intéressante mais ses droits gratuits individuels et attributions éventuelles ne sont pas vérifiés ; aucun fichier Noun Project n'est incorporé. Phosphor (MIT) reste une alternative à comparer.

## Étape suivante
Après approbation visuelle, faire correspondre les IDs de `marketplaceCategories` et intégrer dans une tranche UI isolée ; pas de merge automatique.
