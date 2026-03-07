# YOUMBIA Mobile — Release Readiness Report

**Date:** 2025-03-07  
**Scope:** Final release readiness pass for real device validation and preview builds. No new features; fixes limited to release blockers and build/runtime issues.

---

## 1. Expo project readiness

| Area | Status | Notes |
|------|--------|--------|
| **app.json** | OK | name, slug, version, orientation, icon, scheme `youmbiamobile`, splash, ios/android/web, plugins, experiments.typedRoutes. |
| **Plugins** | OK | expo-router, expo-font, expo-web-browser, expo-sqlite. **Added:** expo-image-picker with French photos permission and camera/microphone set to false (library-only usage). |
| **Icons / splash** | OK | `./assets/images/icon.png`, `./assets/images/splash-icon.png` exist. Android adaptive icon (foreground, background, monochrome) and web favicon present. |
| **Environment variables** | OK | Supabase: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`. Documented in `.env.example`; app throws at load if missing. |
| **Google auth (native)** | OK | signInWithGoogle uses makeRedirectUri + WebBrowser.openAuthSessionAsync. Scheme `youmbiamobile` in app.json. Redirect URL must be allowed in Supabase (e.g. `youmbiamobile://`). See docs/GOOGLE_SIGNIN.md. |
| **Deep link / scheme** | OK | `"scheme": "youmbiamobile"` in app.json. OAuth redirect uses this scheme. |
| **Package consistency** | **Fixed** | expo-doctor reported duplicate native modules (expo-auth-session@55 pulled expo 55 and others). **Fix:** expo-auth-session pinned to `~7.0.10` (SDK 54–compatible). npm overrides for expo-constants, expo-linking, expo-web-browser kept for consistency. |

---

## 2. Fixes applied (release blockers / build readiness)

| Issue | Fix | File(s) |
|-------|-----|--------|
| **expo-doctor: duplicate native dependencies** | Pin expo-auth-session to `~7.0.10` so it uses Expo SDK 54–aligned deps; add overrides for expo-constants, expo-linking, expo-web-browser. | `package.json` |
| **Image picker permission strings** | Add expo-image-picker config plugin with French photos permission; set cameraPermission and microphonePermission to false (app only uses photo library). | `app.json` |

**Result:** `npx expo-doctor` — **17/17 checks passed.**

---

## 3. Runtime-critical integrations verified

| Integration | Status | Notes |
|-------------|--------|--------|
| **Supabase env** | OK | `src/lib/supabase.ts` reads `EXPO_PUBLIC_*`; throws clear error if missing. Session uses expo-sqlite/localStorage. |
| **Google auth** | OK | signInWithGoogle (dynamic import); makeRedirectUri(); redirect scheme. Requires Supabase redirect URL and Google provider configured (see GOOGLE_SIGNIN.md). |
| **Deep linking / redirect** | OK | Scheme youmbiamobile; login redirect param preserved; getSafeRedirect allows only app routes. |
| **Share links** | OK | shareListing uses Share.share + buildShareMessage with LISTING_URL_BASE `https://www.youmbia.com/annonce`. Fallback to WhatsApp deep link. |
| **WhatsApp linking** | OK | ListingActions uses wa.me with normalized phone or pre-filled text. Linking.openURL. |
| **Image display** | OK | Listing images: paths from API → getSignedUrlsMap (listing-images bucket) → toDisplayImageUrl. ListingCard/ListingGallery use first image or placeholder. |
| **Keyboard behavior** | OK | Screen keyboardAvoid used on login, sell, search. Conversation thread uses KeyboardAvoidingView. |
| **Safe areas** | OK | useSafeAreaInsets in Screen, tab bar, listing detail footer, conversation input. |

No code changes were required for these; architecture is already correct.

---

## 4. Build validation

- **TypeScript:** `npx tsc --noEmit` — **PASS**
- **expo-doctor:** **17/17 checks passed** (after dependency fix)
- **Android preview build:** Not run in this pass. Project is configured for it (`expo run:android` or EAS Build). Ensure `.env` is set (or use EAS Secrets) for Supabase.
- **iOS preview build:** Not run in this pass. Project is configured for it (`expo run:ios` or EAS Build). Same env requirement.

---

## 5. Known external setup (developer responsibility)

These are **not** code defects; they must be done once per environment:

1. **Environment**
   - Copy `.env.example` to `.env` and set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` (from Supabase project settings). Required for app to start.

2. **Supabase**
   - Auth → URL Configuration: add redirect URL (e.g. `youmbiamobile://` or the exact value from `makeRedirectUri()` in your build).
   - Auth → Providers → Google: enable and set Web client ID (and secret) from Google Cloud Console.

3. **Google Cloud (for Google Sign-In)**
   - Web application client for Supabase.
   - Optionally iOS/Android OAuth clients for native builds (see GOOGLE_SIGNIN.md).

4. **Preview builds (EAS)**
   - Run `eas build --platform android --profile preview` (or equivalent) after configuring `eas.json` if needed. Use EAS Secrets for env vars in the cloud.

---

## 6. Files changed (summary)

| File | Change |
|------|--------|
| `package.json` | expo-auth-session `^55.0.7` → `~7.0.10`; added overrides for expo-constants, expo-linking, expo-web-browser. |
| `app.json` | Added expo-image-picker plugin with photosPermission (FR), cameraPermission: false, microphonePermission: false. |

---

## 7. Blockers found and status

| Blocker | Status |
|---------|--------|
| Duplicate native dependencies (expo-doctor) | **Fixed** (expo-auth-session 7.x + overrides). |
| Image picker permission strings for store/preview | **Fixed** (config plugin added). |

No other release blockers identified. No product features added; no screen redesigns; architecture and UX unchanged.

---

## 8. Confirmation

- **expo doctor:** Clean (17/17).
- **TypeScript:** No errors.
- **Config:** app.json and plugins aligned with Expo 54 and usage (scheme, icons, splash, image picker).
- **Runtime integrations:** Supabase, auth redirect, share, WhatsApp, images, keyboard, safe areas verified by code review.

**The project is ready for preview builds** (Android/iOS) and real device validation, provided the developer completes the external setup above (env file, Supabase redirect URL and Google provider, and optionally EAS configuration).
