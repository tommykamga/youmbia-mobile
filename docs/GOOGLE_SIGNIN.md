# Google Sign-In avec Supabase (Expo Native)

La connexion Google **complète** l’auth email/mot de passe existante ; elle ne la remplace pas.

---

## Fichiers modifiés

| Fichier | Changement |
|--------|------------|
| `src/services/auth/signInOut.ts` | Suppression des imports/exports liés à Google ; garde uniquement email/password et signOut. |
| `src/services/auth/signInWithGoogle.ts` | **Nouveau.** Logique Google (OAuth, parsing fragment, setSession) ; import de `expo-auth-session` et `expo-web-browser` uniquement ici, chargé à la demande. |
| `src/services/auth/index.ts` | Plus d’export de `signInWithGoogle` (évite chargement au démarrage). |
| `app/(auth)/login.tsx` | Import dynamique de `signInWithGoogle` au clic sur « Continuer avec Google » ; message d’erreur explicite si module natif absent (Expo Go). Lien « Créer un compte » préserve le paramètre `redirect`. |
| `app/(auth)/signup.tsx` | CTA « Continuer avec Google » (même flux que login), paramètre `redirect` pour le retour après auth, lien « Déjà un compte » préserve `redirect`. |

---

## Paquets ajoutés

- **expo-auth-session** — utilisé pour `makeRedirectUri()` (URL de redirect OAuth cohérente avec le scheme de l’app).

Aucun plugin Expo supplémentaire : le scheme `youmbiamobile` est déjà dans `app.json`, et `expo-web-browser` était déjà présent pour `WebBrowser.openAuthSessionAsync`.

---

## Flux auth Google

1. L’utilisateur appuie sur « Continuer avec Google ».
2. L’app obtient une URL de redirect via `makeRedirectUri()` (ex. `youmbiamobile://`).
3. Supabase `signInWithOAuth({ provider: 'google', options: { redirectTo, skipBrowserRedirect: true } })` renvoie l’URL de la page de login Google.
4. `WebBrowser.openAuthSessionAsync(authUrl, redirectTo)` ouvre le navigateur in-app ; après connexion Google, Supabase redirige vers `redirectTo` avec les tokens dans le **fragment** (`#access_token=...&refresh_token=...`).
5. L’app parse le fragment, appelle `supabase.auth.setSession({ access_token, refresh_token })`.
6. La session est persistée par le client Supabase existant (expo-sqlite/localStorage) ; `onAuthStateChange` et le routage existants gèrent la suite.
7. Redirect après login : même logique que l’email (`getSafeRedirect(params.redirect)` puis `router.replace`).

---

## Configuration requise

### 1. Supabase Dashboard

- **Auth → URL Configuration**  
  - **Redirect URLs** : ajouter l’URL de redirect utilisée par l’app.  
  - En dev/natif, c’est en général le scheme de l’app, ex. :  
    `youmbiamobile://`  
  - Pour être sûr, vous pouvez lancer l’app, déclencher une connexion Google et regarder l’erreur Supabase ou les logs pour voir l’URL de redirect utilisée, ou temporairement `console.log(makeRedirectUri())` au démarrage.

- **Auth → Providers → Google**  
  - Activer le provider Google.  
  - Renseigner le **Web client ID** (et secret) depuis Google Cloud Console (type « Web application » pour Supabase).

### 2. Google Cloud Console

- Créer ou utiliser un projet.
- **APIs & Services → Credentials** :
  - **Web application** : utilisé par Supabase (Client ID + Secret dans le provider Google).
- Pour les builds **natifs** (optionnel si tout passe par Supabase) :
  - **iOS** : ajouter un client OAuth « iOS » avec le bundle ID de l’app Expo.
  - **Android** : ajouter un client OAuth « Android » avec le SHA-1 du keystore utilisé pour signer l’app.

Si vous n’ajoutez que le client Web et l’URL de redirect Supabase, le flux in-app browser fonctionne déjà ; les clients iOS/Android peuvent être nécessaires plus tard pour un flux natif type « Sign in with Google » SDK.

### 3. Expo / app config

- **Scheme** : déjà configuré dans `app.json` (`"scheme": "youmbiamobile"`).
- Aucun plugin supplémentaire requis pour le flux actuel (WebBrowser + redirect avec fragment).

---

## Builds natifs / Expo Go

- **Expo Go** : le module `expo-auth-session` dépend de `ExpoCryptoAES` (natif), absent d’Expo Go. L’écran de login s’affiche sans erreur ; si l’utilisateur appuie sur « Continuer avec Google », un message indique que la connexion Google nécessite un build de développement.
- **Build de développement** : pour utiliser vraiment la connexion Google, lancer l’app avec un build natif :
  - `npx expo run:ios` ou `npx expo run:android` (après `npx expo prebuild` si besoin),
  - ou un build EAS (development / preview / production).
- La logique Google est dans un module chargé à la demande (`signInWithGoogle.ts`) pour éviter de charger `expo-auth-session` au démarrage et ainsi éviter le crash « Cannot find native module 'ExpoCryptoAES' » à l’ouverture de l’app sous Expo Go.

---

## Vérifications

- [ ] Auth email/mot de passe inchangée (login, signup, signout).
- [ ] Session persistée après connexion Google (même storage que l’email).
- [ ] Redirect après login Google identique à l’email (paramètre `redirect`, fallback `/(tabs)/home`).
- [ ] Pas d’autre provider ajouté (uniquement Google en plus de l’email).
