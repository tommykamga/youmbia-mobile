# Montée en charge – 10 features marketplace

Document de synthèse après implémentation des fonctionnalités pour faire passer YOUMBIA à l’échelle (sans casser les flux existants).

---

## 1. FEATURES AJOUTÉES

| # | Feature | Statut | Description |
|---|--------|--------|-------------|
| 1 | **Vérification vendeur** | Déjà en place | Badge « Vendeur vérifié » (`is_verified`) dans `ListingSeller` / `SellerBadge`. |
| 2 | **Score de confiance** | Déjà en place | `trust_score`, `reports_count` sur le profil vendeur ; affichage « Score confiance » et badge « Profil fiable » si score ≥ 70. |
| 3 | **Annonces urgentes** | Implémenté | Champ optionnel `urgent` sur les listings ; badge « Urgent » sur les cartes et dans le détail (meta). |
| 4 | **Localisation améliorée** | Implémenté | Champ optionnel `district` (quartier/zone) ; affichage « Ville · Quartier » dans les cartes et le détail. |
| 5 | **Recommandations « Pour vous »** | Implémenté | Section « Pour vous » sur la home (MVP : premières annonces du feed ; prêt pour un endpoint dédié plus tard). |
| 6 | **Favoris intelligents** | UI prête | Type `price_dropped` sur `PublicListing` ; badge « Prix baissé » sur les cartes en contexte favoris lorsque le backend envoie l’info. |
| 7 | **Statistiques vendeur** | Déjà en place | `views_count` affiché dans `ListingMeta` et `ListingCard` (« X vues »). |
| 8 | **Galerie photo améliorée** | Implémenté | Jusqu’à **12 photos** par annonce (constante `MAX_LISTING_IMAGES` dans le flux de vente). |
| 9 | **Détection de doublons** | Backend uniquement | Pas d’implémentation côté app ; à traiter côté backend (similarité titre/description/images). |
| 10 | **Mode hors ligne / continuité** | Implémenté | Section « Consultés récemment » sur la home : stocke les derniers IDs consultés (max 20) et les réaffiche via `getListingsByIds`. |

---

## 2. FICHIERS MODIFIÉS

### Services (listings)

- `src/services/listings/getPublicListings.ts` – types `urgent`, `district` ; select et mapping.
- `src/services/listings/getListingById.ts` – `ListingDetail` + select `district`, `urgent`.
- `src/services/listings/getListingsByIds.ts` – `urgent`, `district` dans le row et le mapping.
- `src/services/listings/searchListings.ts` – idem.
- `src/services/listings/getListingsByCity.ts` – idem.
- `src/services/listings/getMyListings.ts` – idem.

### Services (nouveaux)

- `src/services/recentlyViewed.ts` – store en mémoire des IDs consultés (add / getIds, max 20).

### Features (listings)

- `src/features/listings/ListingCard.tsx` – badges « Urgent » et « Prix baissé », ligne lieu `ville · quartier`.
- `src/features/listings/ListingMeta.tsx` – props `district`, `urgent` ; affichage lieu + badge Urgent.
- `src/features/listings/ForYouSection.tsx` – **nouveau** : section « Pour vous » (horizontal scroll).
- `src/features/listings/RecentlyViewedSection.tsx` – **nouveau** : section « Consultés récemment ».
- `src/features/listings/index.ts` – exports `ForYouSection`, `RecentlyViewedSection`.

### App

- `app/(tabs)/home.tsx` – intégration `ForYouSection` et `RecentlyViewedSection` dans le header du feed.
- `app/listing/[id].tsx` – passage de `district` et `urgent` à `ListingMeta` ; appel à `addRecentlyViewedListingId(id)` après chargement réussi.
- `app/sell/index.tsx` – `MAX_LISTING_IMAGES = 12` ; limite à 12 photos à l’ajout et sur le bouton « Ajouter des photos ».

---

## 3. IMPACT PRODUIT

- **Confiance** : badges Urgent et (à terme) Prix baissé renforcent la clarté et l’engagement.
- **Localisation** : quartier/zone affiché partout où la ville l’est (cartes + détail).
- **Découverte** : section « Pour vous » et « Consultés récemment » améliorent la continuité et la ré-engagement.
- **Vendeurs** : jusqu’à 12 photos par annonce pour mieux valoriser les produits.
- **Doublons** : à gérer côté backend (aucun impact direct sur l’app dans cette phase).

---

## 4. LIMITES

- **Base de données** : les colonnes `urgent` (boolean) et `district` (text, nullable) doivent exister sur la table `listings`. Si elles sont absentes, les requêtes Supabase qui les sélectionnent échoueront. **Contrat de réactivation** : voir [REACTIVATION_SCHEMA_FEATURES.md](./REACTIVATION_SCHEMA_FEATURES.md) (colonnes attendues, fichiers à modifier, pas de select tant que la migration n’est pas faite).
- **Favoris « Prix baissé »** : le badge s’affiche lorsque le backend envoie `price_dropped: true` sur les listings (ex. jointure avec un historique de prix ou table dédiée). L’app ne calcule pas cette donnée.
- **« Pour vous »** : contenu actuel = premières annonces du feed ; un endpoint de recommandations (catégories consultées, favoris, etc.) peut être branché plus tard sans changer le composant.
- **Consultés récemment** : stockage en mémoire uniquement ; recharger l’app efface la liste. Une persistance (ex. AsyncStorage) peut être ajoutée ultérieurement.
- **Détection de doublons** : 100 % côté backend (similarité texte/images) ; pas de changement côté mobile.

---

## Feature 9 – Détection de doublons (référence)

- **Objectif** : limiter les annonces copiées / dupliquées.
- **Où** : backend (Supabase Edge Functions, job, ou règle métier à la création d’annonce). Comparaison de similarité sur titre, description, et éventuellement empreintes d’images.
- **Mobile** : aucun appel spécifique ; l’app continue de créer des annonces via l’API existante. Les refus ou avertissements éventuels peuvent être gérés via les messages d’erreur de l’API.
