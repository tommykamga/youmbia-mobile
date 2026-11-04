# Démonstration visuelle de l’accueil

## Activation et désactivation

Exclusivement dans un client de développement (`__DEV__`). Depuis l’écran Chercher, toucher **Ouvrir la démonstration locale** sous l’en-tête. Aucun changement d’environnement ni redémarrage Metro nécessaire. Le bandeau jaune **DÉMONSTRATION · 48 annonces fictives · favoris locaux** doit être visible. Le mode n’est jamais activé implicitement sur le catalogue réel.

Autre activation explicite au lancement du bundler : `EXPO_PUBLIC_HOME_DEMO=1`. Le drapeau seul ne permet aucune activation en production. Sans le drapeau et sans action sur le bouton, le mode reste désactivé. **Quitter la démonstration** remonte l’écran réel avec ses services/caches normaux ; les brouillons de l’écran réel ne sont pas conservés pendant ce détour. Les favoris démo sont en mémoire et disparaissent à la sortie. Aucun client global de données ou d’authentification remplacé.

## Données et garanties

48 identifiants fixes `home-demo-01` à `home-demo-48`, six catégories et six villes. 44 annonces avec photo locale, quatre cas sans image (11, 22, 33 et 44). Prix incluant des montants supérieurs au milliard de FCFA ; titres volontairement longs. Photos existantes réutilisées : voir `assets/demo/PROVENANCE.md`.

Fournisseur local injecté uniquement dans ListingFeed. Même contrôleur progressif, même grille, mêmes cartes, lots de six et même contrat nextOffset/hasMore. Après un dernier lot plein, une requête locale vide confirme l’épuisement. Les filtres démo s’appliquent avant pagination ; ils ne certifient pas la recherche ou le classement du backend QA. Le bloc Boutiques fictives est un bloc local pleine largeur, pas une lecture des vraies boutiques.

Aucun mélange avec le cache réel. Les favoris démo sont un Set local ; les fiches sont une Modal locale. Aucun appel à FavoriteButton, aucune route /listing/ avec un identifiant fictif, aucune analytics du fil démo. Une carte home-demo-* sans ses contrôles locaux est masquée pour empêcher tout retour accidentel au chemin réel. Le contexte d’authentification existant reste intact ; ses éventuelles lectures normales ne reçoivent aucune donnée fictive.

## Protocole iPhone, distinct de la recette réelle

1. Ouvrir explicitement la démo et observer le bandeau jaune ; contrôler les premières photos.
2. Parcourir plus de 6 puis 12 cartes, jusqu’aux 48 ; vérifier les prix longs, les titres, les cas sans image, le bloc boutiques et le dégagement final.
3. Agrandir le texte OS au-delà de 1,2 : grille une colonne et commandes de recherche sur une deuxième rangée ; recherche de hauteur minimale 56 pt, rayon 16, cibles de 44 pt minimum. La hauteur grandit pour le texte, elle n’est pas bloquée à 56.
4. Changer ville, catégorie, recherche et prix ; appliquer, annuler, réinitialiser. Vérifier les montants longs après réduction à une colonne.
5. Ajouter/retirer un favori local, ouvrir une fiche fictive et revenir au fil.
6. Quitter la démo puis constater le retour aux annonces QA réelles ; reprendre séparément leur recette.

Ni une compilation Metro ni un test React avec mocks ne vaut une capture iPhone ou un PASS physique. STATUS.md consigne les retours réellement reçus.
