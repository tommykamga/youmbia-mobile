# ROLLBACK-SHOP-EDIT-01

**Date :** 2026-11-05
**Branche :** `feat/ui-account-shop-edit-01`
**Worktree :** `/Users/tommy/APP TESKA/YOUMBIA/youmbia-ui-account-shop`
**Méthode :** suppressions ciblées + restauration services partagés (pas de `git reset --hard`, pas de revert global).

## Retiré (SHOP EDIT)

| Élément |
|---------|
| Route `/account/shop/edit` (`app/account/shop/edit.tsx`) |
| Route DEV `/account/shop/keyboard-dev` |
| `updateProShop` + tests |
| `buildUpdateProShopPayload` + tests |
| `shopEditNavigationGuard` + tests |
| `useShopEditKeyboardProbe` |
| `shopMutationDevDiagnostics` + tests |
| `shopImageUploadIntent` + tests |
| `editShopHydration.test.ts` |
| Action « Modifier » (carte Compte + écran « déjà une boutique ») |
| `docs/ui-redesign/QA-FIX-SHOP-EDIT-01.md` |
| `supabase/scripts/qa_shop_storage_rls_01.sql` (introduit pour SHOP EDIT) |

## Conservé (ACCOUNT + parcours boutique existants)

| Élément |
|---------|
| **ACCOUNT-01** — cartes Compte (padding, compact, Partager, navigation boutique publique, Créer ma boutique) |
| **ACCOUNT-02** — `countMyActiveListings`, hook, libellés FR, refresh focus |
| `createProShop`, `uploadShopImage` (version création), `getSellerShop` |
| Consultation boutique publique, partage (`useProSellerActivation` / `shareShop`) |
| `docs/ui-redesign/ACCOUNT-SHOP-EDIT-01.md` (note de rollback en tête) |

## Fichiers modifiés au rollback

- `src/features/account/AccountPriorityActions.tsx` — Partager seul (bande compacte 44pt), sans Modifier
- `src/features/account/AccountPriorityActions.test.tsx`
- `app/account/pro-shop.tsx` — retrait bouton Modifier
- `src/services/shops/index.ts` — retrait exports update
- `src/services/shops/uploadShopImage.ts` — restauré (création boutique)
- `src/services/shops/getSellerShop.ts` — restauré (sans option `resolveMedia`)

## Tests exécutés

| Contrôle | Résultat |
|----------|----------|
| `npm run typecheck` | **PASS** |
| ESLint (`pro-shop`, `AccountPriorityActions*`, `uploadShopImage`, `getSellerShop`, `index`) | **PASS** |
| Vitest — 6 fichiers, 30 tests (`AccountPriorityActions`, `AccountScreen`, `useSellerActiveListingsCount`, `countMyActiveListings`, `createProShop`, `ProSellerActivationCard`) | **PASS** |
| `git diff --check` | **PASS** |

## Réserves

- L’édition boutique reste un besoin produit ; réintroduction future via PR dédiée après résolution clavier iOS / RLS Storage QA.
- Aucune mutation Supabase QA/PROD effectuée.

## PR

Branche prête pour **PR ACCOUNT-only** (cartes + compteur), sans surface SHOP EDIT.
