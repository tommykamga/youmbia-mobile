# Supabase — Lien magique mobile : Redirect URLs et modèles d’email

Ce guide sert à **verrouiller** le cas où un utilisateur demande un **lien magique** depuis l’app YOUMBIA Mobile : après clic dans l’e-mail, la session doit se finaliser **dans l’app** (schéma `youmbiamobile://`), et non sur le site web par défaut.

**Référence code :**

- `app/(auth)/login.tsx` — `signInWithOtp` avec `emailRedirectTo: makeRedirectUri({ path: ... })`
- `app/(auth)/reset.tsx` — `resetPasswordForEmail` avec `redirectTo: makeRedirectUri()`
- `app.json` — `"scheme": "youmbiamobile"`

---

## 1. Pourquoi le lien « ouvre le site »

1. **Site URL (Supabase)**  
   Si le **Site URL** du projet est `https://www.youmbia.com` (ou similaire), certains flux ou contenus par défaut peuvent orienter l’utilisateur vers le **web**. Ce n’est pas un bug de l’app : c’est la **configuration Auth** du projet Supabase.

2. **`emailRedirectTo` non autorisé**  
   Supabase n’accepte une redirection après vérification du token **que** si l’URL exacte (ou le motif autorisé) figure dans **Redirect URLs**. Sinon, la redirection peut échouer ou retomber sur le **Site URL** web.

3. **E-mail ouvert dans le navigateur**  
   Le premier clic ouvre souvent **Safari / Chrome**. C’est normal : après validation Supabase, le navigateur doit rediriger vers `redirect_to`. Si cette URL est `youmbiamobile://...`, le système **réassocie l’URL à l’app** (tant que le schéma est enregistré sur l’appareil).

---

## 2. Vérification dans le dashboard Supabase

Chemin : **Authentication → URL Configuration** (noms pouvant varier légèrement selon la version du dashboard).

### 2.1 Site URL

- Souvent : l’URL du **site web** principal (ex. `https://www.youmbia.com`).  
- Elle reste utile pour le **web** ; elle ne remplace pas la liste des **Redirect URLs** pour le mobile.

### 2.2 Redirect URLs (liste blanche)

Ajouter **toutes** les cibles utilisées par l’app. Le client mobile envoie des URLs produites par `makeRedirectUri()` (Expo Auth Session).

**À inclure au minimum :**

| Contexte | Exemple / motif | Remarque |
|----------|-----------------|----------|
| Build store / dev client | `youmbiamobile://` | Schéma défini dans `app.json` |
| Variante avec chemin | `youmbiamobile://*` ou chemins explicites | Selon [docs Supabase](https://supabase.com/docs/guides/auth/redirect-urls) : les jokers peuvent être supportés selon la config du projet |
| Expo Go / dev Metro | `exp://127.0.0.1:8081/**`, `exp://192.168.*.*:8081/**` | IP LAN changeante → en dev, **copier l’URL exacte** depuis un log (voir § 4) |
| Localhost (si utilisé) | `http://localhost:8081/**` | Rare pour lien magique sur device physique |

**Important :** la valeur **exacte** passée à `emailRedirectTo` (caractère par caractère) doit être **autorisée**. En cas de doute, utiliser le § 4 pour la copier depuis l’app.

**Autres flux Auth (même liste) :**

- **Google OAuth** : même `redirectTo` que `makeRedirectUri()` dans `signInWithGoogle.ts` → doit aussi être dans **Redirect URLs**.
- **Réinitialisation mot de passe** : `makeRedirectUri()` dans `reset.tsx` → idem.

---

## 3. Modèles d’e-mail (Auth templates)

Chemin : **Authentication → Email Templates** (ou **Templates**).

### 3.1 Template « Magic Link »

- Le corps utilise en général **`{{ .ConfirmationURL }}`** : c’est l’URL générée par Supabase (point d’entrée `auth/v1/verify` + redirection vers `redirect_to` après validation).
- Vous **n’avez pas** besoin de remplacer manuellement par une URL web YOUMBIA pour que le mobile fonctionne : tant que le client envoie `emailRedirectTo: youmbiamobile://...` et que cette URL est **autorisée**, le `redirect_to` dans le flux de vérification pointe vers l’app.

### 3.2 Contenu recommandé (UX)

- Texte clair du type : *« Si vous avez demandé ce lien depuis l’application mobile YOUMBIA, le bouton ouvrira l’app après connexion. »*  
- Éviter de promouvoir uniquement *« connectez-vous sur le site »* si le produit veut prioriser l’app pour ce flux.

### 3.3 Site web vs app

- Si le **même** projet Supabase sert **web + mobile**, les templates sont **partagés**. On ne casse pas le web en gardant `{{ .ConfirmationURL }}` : le **comportement** dépend de la valeur de `redirect_to` envoyée par chaque client (web = URL web autorisée, mobile = `youmbiamobile://...` autorisée).

---

## 4. Obtenir l’URL exacte `emailRedirectTo` (indispensable en dev)

Les URLs **Expo Go** (`exp://...`) changent avec l’IP du PC ou le port Metro.

**Méthode fiable :**

1. Temporairement, dans `app/(auth)/login.tsx`, juste avant `signInWithOtp`, loguer :
   - `console.log('MAGIC redirectTo', redirectTo);`
2. Lancer l’app, demander un lien magique, lire la valeur dans la console Metro / Xcode / Logcat.
3. Copier cette chaîne **intégralement** dans **Redirect URLs** du projet Supabase.
4. Retirer le `console.log` avant merge / release.

**Alternative :** déclencher un envoi OTP et lire l’erreur renvoyée par Supabase du type *redirect URL not allowed* — l’URL citée est celle à ajouter.

---

## 5. Après clic sur le lien : session dans l’app

Le projet garde `detectSessionInUrl: false` dans `src/lib/supabase.ts` (évite tout traitement implicite au chargement).

**Handler mobile (implémenté)** — `src/services/auth/handleSupabaseAuthDeepLink.ts`, branché dans `app/_layout.tsx` **avant** les deep links d’annonces :

1. `Linking.getInitialURL()` + `Linking.addEventListener('url')` reçoivent l’URL complète (fragment `#access_token=…` inclus).
2. Parsing aligné sur `@supabase/auth-js` : **query + hash** ; repli si `new URL()` échoue.
3. **PKCE** : `supabase.auth.exchangeCodeForSession(code)` si `code` est présent.
4. **Implicit** : `supabase.auth.setSession({ access_token, refresh_token })` si les deux sont présents ; si une session existe déjà (ex. retour Google + même URL via `Linking`), on **ne** rappelle pas `setSession` inutilement.
5. Déduplication par **URL brute** pour éviter double navigation / double traitement.
6. Navigation : `buildPostAuthHref(redirect, contact)` à partir du **path/query** Expo (`makeRedirectUri` + contexte), comme après login manuel.

Erreurs OAuth dans l’URL : `Alert` + navigation vers la destination « safe » (sans session valide).

---

## 6. Checklist rapide (prod)

- [ ] **Redirect URLs** contient `youmbiamobile://` (et variantes exactes utilisées par les builds EAS).
- [ ] Chaque build / variante de `makeRedirectUri()` testée au moins une fois (ou URL loguée puis ajoutée).
- [ ] **Google** : même liste (voir `docs/GOOGLE_SIGNIN.md`).
- [ ] **Reset password** : `makeRedirectUri()` autorisé.
- [ ] Template e-mail : message utilisateur cohérent app + web ; pas de lien manuel vers une **page auth web** unique si le mobile doit rester prioritaire sur ce parcours.

---

## 7. Documentation officielle

- [Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
- [Email templates](https://supabase.com/docs/guides/auth/auth-email-templates)
- [Native mobile deep linking](https://supabase.com/docs/guides/auth/native-mobile-deep-linking) (à comparer avec l’état actuel du client RN dans ce repo)

---

## 8. Web-safe

Ce document ne modifie aucun code **web** : il décrit uniquement la configuration **Supabase** partagée entre clients. Le site YOUMBIA peut continuer à utiliser ses propres URLs dans **Redirect URLs** en parallèle des URLs `youmbiamobile://`.
