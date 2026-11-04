# Démonstration visuelle de l’accueil

## Activation et désactivation

Exclusivement dans un client de développement (`__DEV__`). Depuis l’écran Chercher, toucher **Ouvrir la démonstration locale** sous l’en-tête. Aucun changement d’environnement ni redémarrage Metro nécessaire. Le petit indicateur **Démonstration** doit être visible. Le toucher ouvre le panneau de développement : compteurs, réinitialisation et sortie. Il est replié par défaut. Le mode n’est jamais activé implicitement sur le catalogue réel.

Autre activation explicite au lancement du bundler : `EXPO_PUBLIC_HOME_DEMO=1`. Le drapeau seul ne permet aucune activation en production. Sans le drapeau et sans action sur le bouton, le mode reste désactivé. **Quitter la démonstration**, dans ce panneau, remonte l’écran réel avec ses services/caches normaux ; les brouillons de l’écran réel ne sont pas conservés pendant ce détour. Les favoris démo sont en mémoire et disparaissent à la sortie. Aucun client global de données ou d’authentification remplacé.

## Données et garanties

48 identifiants fixes `home-demo-01` à `home-demo-48`, six villes et des classifications de fixtures rattachées aux slugs de la taxonomie métier chargée par useMarketplaceCategories. Aucun libellé ni identifiant de catégorie parallèle en démo. Les descendants sont résolus par le helper métier commun. 44 annonces avec photo locale, quatre cas sans image (11, 22, 33 et 44). Prix incluant des montants supérieurs au milliard de FCFA ; titres volontairement longs. Photos existantes réutilisées : voir `assets/demo/PROVENANCE.md`.

Fournisseur local injecté uniquement dans ListingFeed. Même contrôleur progressif, même grille, mêmes cartes, lots de six et même contrat nextOffset/hasMore. Après un dernier lot plein, une requête locale vide confirme l’épuisement. Les filtres démo s’appliquent avant pagination ; ils ne certifient pas la recherche ou le classement du backend QA. Le bloc Boutiques fictives est un bloc local pleine largeur, pas une lecture des vraies boutiques.

Aucun mélange avec le cache réel. Les favoris démo sont un Set local ; les fiches sont une Modal locale. Aucun appel à FavoriteButton, aucune route /listing/ avec un identifiant fictif, aucune analytics du fil démo. Une carte home-demo-* sans ses contrôles locaux est masquée pour empêcher tout retour accidentel au chemin réel. Le contexte d’authentification existant reste intact ; ses éventuelles lectures normales ne reçoivent aucune donnée fictive.

## Protocole iPhone, distinct de la recette réelle

1. Ouvrir explicitement la démo et observer le petit indicateur Démonstration ; contrôler les premières photos.
2. Parcourir plus de 6 puis 12 cartes, jusqu’aux 48 ; vérifier les prix longs, les titres, les cas sans image, le bloc boutiques et le dégagement final.
3. Agrandir le texte OS au-delà de 1,2 : grille une colonne et commandes de recherche sur une deuxième rangée ; recherche de hauteur minimale 56 pt, rayon 16, cibles de 44 pt minimum. La hauteur grandit pour le texte, elle n’est pas bloquée à 56.
4. Changer ville, catégorie, recherche et prix ; appliquer, annuler, réinitialiser. Vérifier les montants longs après réduction à une colonne.
5. Ajouter/retirer un favori local, ouvrir une fiche fictive et revenir au fil.
6. Quitter la démo puis constater le retour aux annonces QA réelles ; reprendre séparément leur recette.

Ni une compilation Metro ni un test React avec mocks ne vaut une capture iPhone ou un PASS physique. STATUS.md consigne les retours réellement reçus.


## Boutiques populaires réutilisées

Le bloc de texte provisoire est remplacé par le composant existant **PopularShopsSection**, son rail horizontal et ses **ShopCard**. Le fournisseur local expose trois boutiques fictives (Téléphones Démo, Atelier Mode Démo, Maison Démo), avec visuels locaux existants, initiales, villes et compteurs. Le rail affiche « Boutiques à découvrir » ; son sous-titre précise « Démonstration · destinations simulées ».

L’insertion existante reste après les six premières annonces, en rangée pleine largeur, une seule fois même après chargement des lots suivants. Il faut défiler au-delà des trois premières rangées en grille deux colonnes. Si les critères laissent moins de six annonces, le seuil d’insertion existant masque toujours le bloc ; Réinitialiser pour la démonstration complète.

Toucher la carte entière ouvre une Modal locale « BOUTIQUE FICTIVE · destination simulée », puis Retour au fil. Aucun slug/ID démo envoyé à la route /shop ou au backend, aucun contact/achat réel. Sans option preview, le composant conserve son service/cache et sa navigation réelle habituels. La présence de ces boutiques démo ne prouve pas la présence de boutiques actives dans les données QA.


## Finition commune catégories et boutiques

L’accueil réel utilise HomeCategoryStrip, qui charge la taxonomie puis rend HomeCategoryStripContent. La démo charge la même taxonomie et rend exactement ce même composant visuel avec ses handlers locaux. Pictogrammes 25 pt, support menthe 48×48, rayon 14, texte 12/16 ; sélection par fond/contour/graisse. La démo dépend de la lecture/cache existante des catégories pour ces libellés et IDs ; elle n’invente pas un catalogue de secours hors ligne. Aucune écriture n’en découle.

PopularShopsSection utilise maintenant ShopCard variant="home" en démo comme en mode normal : largeur cible 272 pt, rayon 16, couverture 104 pt avec fallback sobre, nom puis Ville · N annonces et chevron. Aucun bouton Voir ni statut déclaré dans cette variante. Les variantes default et compact sont inchangées. Le statut déclaré reste dans la fiche réelle existante et la fiche simulée. Le choix des boutiques, l’insertion unique et la pagination restent identiques.

L’indicateur Démonstration ouvre/replie un panneau réservé à la démo. Sortie, compteurs et réinitialisation y sont regroupés ; ils ne repoussent plus les premières cartes quand le panneau est fermé. Ne pas réutiliser les anciennes captures comme preuve de cette finition : deux nouvelles captures sont attendues (haut et rail).


## Cohérence finale des trois points ciblés

Les cellules de catégorie affichent maintenant le nom métier exact de la branche sélectionnée : Électronique ne s’appelle plus Téléphones et Véhicules ne s’appelle plus Auto. Les pictogrammes existants par slug décrivent cette branche ; aucun ID, descendant, ordre ou gestionnaire de destination n’est changé.

La feuille dédiée Ville est CityPickerSheet dans les deux modes : un seul titre, champ, suggestions facultatives provenant du mode appelant, Appliquer primaire, Réinitialiser secondaire et fermeture. Le brouillon reste contrôlé par chaque appelant ; fermer ne l’applique pas, rouvrir reprend le critère appliqué, et Réinitialiser retire uniquement la ville. Les filtres complets gardent leur propre champ Ville.

Les prix utilisent le même formateur français déterministe en mode normal et en démo, sans dépendre de la locale Intl/Hermes : groupes de trois par espace fine insécable, virgule décimale, espace insécable avant FCFA. Exemple : 1 234 567 890 FCFA. Aucun chiffre n’est arrondi par le formateur ; le nombre JavaScript fourni reste la limite de précision. Les textes de prix des cartes accueil et du rail featured n’ont plus de limite de lignes, d’ellipse ou de réduction automatique de police ; ils peuvent grandir avec le texte OS.
