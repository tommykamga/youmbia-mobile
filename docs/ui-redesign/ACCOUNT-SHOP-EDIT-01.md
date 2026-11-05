# ACCOUNT-SHOP-EDIT-01 — Compte, compteur annonces, édition boutique

> **Note (ROLLBACK-SHOP-EDIT-01) :** la partie **édition boutique** (`/account/shop/edit`, `updateProShop`, etc.) a été retirée. Les sections ACCOUNT-01 / ACCOUNT-02 de ce document restent valides. Voir `ROLLBACK-SHOP-EDIT-01.md`.

**Date :** 2026-11-05
**Branche :** `feat/ui-account-shop-edit-01`
**Worktree :** `/Users/tommy/APP TESKA/YOUMBIA/youmbia-ui-account-shop`
**Base :** `origin/main` @ `1fbec1f` (merge PR #32 UI-HEADER-Y-01)

---

## 1. Audit initial

| Zone | Constat | Décision |
|------|---------|----------|
| `AccountPriorityActions` | `width: '100%'` + `marginHorizontal: screenHorizontal` sur le conteneur → débordement horizontal iPhone | Remplacer par `paddingHorizontal` sur le conteneur, sans `marginHorizontal` |
| Compteur annonces | Libellé statique « Mes annonces » | `countMyActiveListings` (head count, `status = active`, RLS) + hook focus Compte |
| Édition boutique | `pro-shop` création only ; écran « déjà une boutique » sans modifier | Route `/account/shop/edit` + `updateProShop` (whitelist champs, slug inchangé) |
| Services shops | `createProShop`, `getSellerShop`, pas d’update | `updateProShop.ts` réutilise upload + normalisation téléphone |
| Tests | `AccountPriorityActions.test.tsx` (3 pressables shop) | Étendu layout, compteur, Modifier / Partager |

**Hors périmètre livré sans GO :** migrations SQL, policies Storage `/shops/` QA, merge `feat/ui-shop-01` (`shopMediaUrl`).

---

## 2. Règles métier

### Compteur annonces actives

- Utilisateur authentifié uniquement.
- `listings.user_id = auth.uid()` (RLS).
- Statut canonique `LISTING_STATUS.active`.
- Exclut brouillons, masquées, vendues, supprimées.
- Erreur réseau : conserver le dernier compteur fiable ; sinon « Compteur indisponible » (pas de faux zéro).

### Édition boutique

- Propriétaire via `profiles.shop_id` + filtre `owner_id` à la mise à jour.
- Champs modifiables : nom, description, ville, téléphone, WhatsApp, logo, bannière.
- **Slug non modifié** (liens / QR conservés).
- Statut `suspended` : refus côté service + UI lecture seule.
- Médias : conservation si non remplacés ; upload uniquement si nouvelle image (base64).

---

## 3. Fichiers modifiés / ajoutés

| Fichier | Action |
|---------|--------|
| `src/features/account/AccountPriorityActions.tsx` | Refonte layout + UX |
| `src/features/account/activeListingsCountLabel.ts` | Libellés FR compteur |
| `src/features/account/useSellerActiveListingsCount.ts` | Hook refresh au focus |
| `src/services/listings/countMyActiveListings.ts` | Count Supabase head |
| `src/services/shops/updateProShop.ts` | PATCH whitelist |
| `app/account/shop/edit.tsx` | Écran modification |
| `app/account/pro-shop.tsx` | Lien « Modifier ma boutique » si déjà créée |
| `src/services/listings/index.ts` | Export count |
| `src/services/shops/index.ts` | Export update |
| Tests associés (`*.test.ts(x)`) | Layout, count, update, libellés |

---

## 4. Contrôles exécutés

| Contrôle | Résultat |
|----------|----------|
| `npm run typecheck` | **PASS** |
| `eslint` (fichiers modifiés listés) | **PASS** |
| `vitest` (account + count + updateProShop) | **36 tests PASS** (6 fichiers account-related) |
| `git diff --check` | **PASS** |

---

## 5. Sécurité / RLS (réserve)

- Le client s’appuie sur les policies **existantes** `shops` UPDATE pour le propriétaire ; pas de `service_role`.
- Patch explicite côté client (pas de `slug`, `owner_id`, `status`, `is_verified`, `is_featured`).
- **À valider en QA :** UPDATE refusé pour non-propriétaire ; boutique suspendue ; Storage logo/bannière owner-only (cf. QA-SHOP-STORAGE-01).
- Aucune modification PROD Supabase dans ce lot.

---

## 6. Recette iPhone physique

| Étape | État |
|-------|------|
| Marges / hauteur cartes Compte | **En attente utilisateur** |
| Compteur vs Mes annonces | **En attente utilisateur** |
| Modifier boutique → enregistrer → fiche publique | **En attente utilisateur** |
| Partager | **En attente utilisateur** |
| Texte agrandi (accessibilité) | **En attente utilisateur** |

L’agent ne déclare pas PASS recette device sans retour réel.

---

## 7. Note critique (pré-recette)

| Critère | Note |
|---------|------|
| Layout Compte | 9/10 (correction cause overflow ; recette device pending) |
| Compteur fiable | 9/10 |
| Édition boutique | 9/10 (dépend RLS/Storage QA) |
| Tests automatisés | 9,5/10 |
| **Global pré-QA iPhone** | **9/10** |

**GO QA iPhone :** conditionnel — code + tests OK ; recette physique requise.
**GO publication stores :** **NO-GO** (règles mission).

---

## 8. Git

- Commit local unique sur `feat/ui-account-shop-edit-01`.
- **Pas de push / merge** sans GO CTO.
