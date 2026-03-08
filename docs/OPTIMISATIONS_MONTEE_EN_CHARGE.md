# Optimisations techniques – Montée en charge

Documentation des 5 optimisations à fort impact implémentées sans refonte d’architecture.

---

## 1. Listes / FlatList

**Fichiers concernés :**  
`ListingFeed.tsx`, `app/(tabs)/search.tsx`, `app/account/listings.tsx`, `app/user/[id].tsx`, `app/(tabs)/favorites.tsx`, `app/(tabs)/messages.tsx`, `NearYouSection.tsx` (déjà optimisé).

**Changements :**
- **keyExtractor** : déjà stable partout (callback `useCallback` avec `[]`).
- **initialNumToRender** : 10 (feed, search, mes annonces, profil vendeur, favoris, messages), 6 pour le skeleton du feed, 4 pour NearYou (horizontal).
- **windowSize** : 6 (ou 4 pour skeleton) pour limiter le nombre de cellules montées.
- **removeClippedSubviews** : activé sur toutes les FlatList pour libérer les vues hors écran (surtout utile sur Android).
- **getItemLayout** : déjà présent sur NearYouSection (largeur fixe) ; non ajouté sur les feeds verticaux (hauteur de carte variable).
- **Profil vendeur** : `ListHeaderComponent` passé en `useMemo` pour éviter une nouvelle référence à chaque render.

**Impact attendu :** Moins de cellules rendues, scroll plus fluide, moins de mémoire utilisée sur les longues listes.

---

## 2. Mémoïsation UI

**Fichiers concernés :**  
`src/features/listings/ListingCard.tsx`, `app/account/listings.tsx`.

**Changements :**
- **ListingCard** : composant exporté via `memo(ListingCardInner)` pour limiter les re-renders quand les props (listing, isFavorite) sont inchangées.
- **MyListingRow** (mes annonces) : enveloppé dans `memo(MyListingRowInner)` ; `onRefresh` stable (useCallback) pour que le memo soit efficace.
- **NearYouCard** : déjà mémoïsé.

**Impact attendu :** Moins de re-renders des cartes lors du scroll ou des changements de tri/favoris, meilleure fluidité perçue.

---

## 3. Limiter les refresh / fetch inutiles

**Fichier concerné :**  
`app/account/listings.tsx`.

**Changements :**
- **Mes annonces** : suppression du `useFocusEffect` qui appelait `load()` à chaque retour sur l’écran. Le chargement se fait au montage (useEffect) et au pull-to-refresh uniquement.
- **Feed home** : inchangé ; chargement une seule fois au montage (ref anti double-mount), `useFocusEffect` ne rafraîchit que les favoris (léger).
- **Favoris / Messages** : `useFocusEffect` conservé pour resynchroniser la liste au retour (cohérent avec l’usage “inbox”).

**Impact attendu :** Moins d’appels réseau et de re-renders au simple retour sur “Mes annonces”, tout en gardant un rafraîchissement explicite (pull-to-refresh).

---

## 4. Robustesse images

**Audit :**  
- ListingCard et NearYouCard utilisent déjà un **placeholder** (“Aucune photo”) quand `images` est vide ou invalide.
- **Dimensions** : `imageWrap` avec `aspectRatio` (4/3) ou hauteur fixe (NearYou) ; pas de layout cassé.
- **Signed URLs** : gérées côté services, pas de changement demandé.

**Conclusion :** Aucune modification ; l’existant est jugé suffisamment robuste (dimensions stables, fallback propre).

---

## 5. Pagination / chargement incrémental

**Fichiers concernés :**  
`src/services/listings/getPublicListings.ts`, `src/features/listings/ListingFeed.tsx`.

**Changements :**
- **getPublicListings** : signature `getPublicListings(offset?, limit?)` avec défaut `offset=0`, `limit=PAGE_SIZE` (20). Utilisation de Supabase `.range(from, to)` pour la pagination.
- **ListingFeed** :
  - Premier chargement : `load(0, false)` (remplace la liste, charge les favoris).
  - **onEndReached** + **onEndReachedThreshold={0.4}** : appelle `loadMore()` qui fait `load(currentLength, true)` pour ajouter la page suivante.
  - **loadingMoreRef** : évite les appels doubles pendant un chargement en cours.
  - **hasMoreRef** : mis à `false` quand la dernière réponse contient moins de `PAGE_SIZE` éléments (dernière page).
- Les appels existants sans arguments (`getPublicListings()`) restent valides (première page, 20 éléments).

**Impact attendu :** Feed “Nouvelles annonces” qui charge par blocs de 20, moins de données et de rendu initial, meilleure réactivité au premier affichage.

**Limite backend :** Aucune. Supabase supporte `.range()`. La recherche (`searchListings`) et “Mes annonces” restent en chargement unique (pas de pagination côté UI pour l’instant).

---

## Garde-fous respectés

- Aucune refonte d’architecture.
- Aucune nouvelle dépendance.
- Supabase : uniquement l’ajout des paramètres `offset`/`limit` et `.range()` dans `getPublicListings`.
- Parcours existants et lisibilité du code conservés.

---

## Optimisations non faites (périmètre / backend)

- **getItemLayout** sur le feed vertical : hauteur des cartes variable (titre 2 lignes) ; impliquerait de fixer la hauteur des cartes ou un calcul plus complexe.
- **Pagination recherche / mes annonces** : non implémentée ; possible plus tard si les services exposent offset/limit.
- **Cache / stale-while-revalidate** : hors périmètre “sans refonte”.
- **Images** : pas de cache disque/mémoire dédié (hors périmètre).
