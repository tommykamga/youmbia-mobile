# SHOP-MEDIA-FINAL-01

**Base :** `origin/main` @ `5582991e6fa0cab42bdaedbd735dfae85e10ea06`  
**Branche :** `fix/shop-media-final-01`  
**Worktree :** `youmbia-ui-shop-media-final-01`  
**Référence étudiée :** `2a8f81c6f1adee86255403281893dbc054630a85` (sans cherry-pick)

## Écarts vs `2a8f81c`

| Sujet | `2a8f81c` | Cette PR |
|-------|-----------|----------|
| Fallback après batch | `resolveSingleListingImageUrl` (rappelle `getSignedUrlsMap`) | Un seul `getSignedUrlsMap` (fallback unitaire déjà dans `listingImageUrl`) |
| `resolveShopsMediaUrls` | `Promise.all` async par boutique | Mapping synchrone après un batch unique |
| `ShopCard` home | Inchangé dans le commit source | Déjà avec `coverFailed` ; default/compact bannière + `isDisplayable` |
| Tests | `shopMediaUrl.test.ts` | + batch multi-shop, + `ShopCard.media.test.tsx` |

## Fichiers touchés

- `src/lib/shopMediaUrl.ts`, `shopMediaUrl.test.ts`
- `src/features/shops/ShopCard.tsx`, `ShopCard.media.test.tsx`
- `app/shop/[slug].tsx`
- `src/services/shops/createProShop.ts`

## QA (2026-11-05)

| Contrôle | Résultat |
|----------|----------|
| `npm run typecheck` | PASS |
| ESLint (fichiers touchés) | PASS |
| Vitest ciblé (23 tests, 4 fichiers) | PASS |
| `git diff --check` | PASS |
