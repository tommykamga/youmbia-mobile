# Contrat de réactivation – features dépendantes du schéma

Document actionnable pour réactiver les features **boosted**, **urgent** et **district** une fois les colonnes ajoutées en base Supabase.  
Aucune modification Supabase dans ce repo ; la migration est à exécuter côté projet Supabase.

---

## 1. Colonnes attendues (migration Supabase)

À créer sur la table **`listings`** :

| Colonne   | Type    | Nullable | Description |
|-----------|---------|----------|-------------|
| `boosted` | boolean | non      | Défaut `false`. Annonces mises en avant (tri feed). |
| `urgent`  | boolean | non      | Défaut `false`. Badge « Urgent » sur cartes et détail. |
| `district`| text    | oui      | Quartier ou zone (localisation améliorée). |

Exemple SQL (à exécuter dans l’éditeur SQL Supabase) :

```sql
ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS boosted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS urgent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS district text;
```

---

## 2. Fichiers où réintégrer les champs dans le `.select()`

Après migration, **ajouter** les noms de colonnes dans les chaînes `select()` des fichiers suivants.

### 2.1 Feed et liste publique

| Fichier | Select actuel (extrait) | À ajouter dans la chaîne |
|---------|-------------------------|---------------------------|
| `src/services/listings/getPublicListings.ts` | `'id, title, price, city, created_at, views_count, user_id, listing_images(...)'` | `boosted, urgent, district` |

### 2.2 Détail d’une annonce

| Fichier | Select actuel (extrait) | À ajouter |
|---------|-------------------------|------------|
| `src/services/listings/getListingById.ts` | `'id, title, price, city, description, created_at, views_count, user_id, status, listing_images(...)'` | `district, urgent` |

*(Pas de `boosted` dans le détail, inutile pour cet écran.)*

### 2.3 Listings par IDs (favoris, consultés récemment)

| Fichier | À ajouter dans la chaîne |
|---------|---------------------------|
| `src/services/listings/getListingsByIds.ts` | `urgent, district` |

### 2.4 Recherche

| Fichier | À ajouter dans la chaîne |
|---------|---------------------------|
| `src/services/listings/searchListings.ts` | `urgent, district` |

### 2.5 Par ville (Près de vous)

| Fichier | À ajouter dans la chaîne |
|---------|---------------------------|
| `src/services/listings/getListingsByCity.ts` | `urgent, district` |

### 2.6 Mes annonces

| Fichier | À ajouter dans la chaîne |
|---------|---------------------------|
| `src/services/listings/getMyListings.ts` | `urgent, district` |

---

## 3. Comportement après réactivation

Aucun changement de code supplémentaire dans l’app : le **mapping** et l’**UI** utilisent déjà la couche centralisée.

- **`src/lib/listingSchemaFeatures.ts`**  
  `normalizeListingSchemaFeatures(row)` lit `row.boosted`, `row.urgent`, `row.district`. Dès que ces champs sont présents dans la réponse Supabase, les valeurs sont propagées.

- **Affichage**  
  - Badge « Urgent » : `getDisplayUrgent(listing)` → affiché uniquement si `urgent === true`.  
  - Quartier : `getDisplayLocationLine(city, district)` → « Ville · Quartier » si `district` non vide.  
  - Tri « récent » : `getDisplayBoosted(listing)` → annonces avec `boosted === true` en premier.

Écrans concernés une fois les colonnes et les `select()` mis à jour :

- **Home** : feed (tri boost), cartes (badge Urgent, lieu ville · quartier), sections Pour vous / Consultés récemment.
- **Recherche** : résultats (badge Urgent, lieu), tri récent (boost).
- **Favoris** : cartes (badge Urgent, lieu).
- **Détail annonce** : meta (badge Urgent, lieu ville · quartier).
- **Mes annonces** : cartes (badge Urgent, lieu).

---

## 4. Points de vigilance

- Ne pas réactiver en ajoutant les colonnes dans les `select()` **avant** que la migration Supabase soit appliquée (erreur « column does not exist »).
- Ne pas introduire de valeurs hardcodées (ex. `urgent: true`) dans le mapping : les fallbacks restent dans `listingSchemaFeatures.ts` (valeurs sûres quand la colonne est absente).
- Après réactivation, les types TypeScript et les composants restent inchangés ; seules les chaînes `select()` des fichiers listés en §2 doivent être modifiées.
