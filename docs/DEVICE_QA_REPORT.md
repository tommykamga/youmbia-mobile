# YOUMBIA Mobile — Device QA Preparation Pass

**Date:** 2025-03-07  
**Objective:** Prepare for real-device QA after release-readiness validation. No new features, no redesign, no architecture changes. Testability and low-risk blockers only.

---

## 1. Real-device QA checklist

Use this on physical devices (Android + iOS) and/or preview builds. Check each line as you validate.

### Auth
- [ ] **Login (email/password)** – Saisie email + mot de passe → Connexion → Redirection vers l’écran d’origine ou Accueil.
- [ ] **Login (Google)** – « Continuer avec Google » → navigateur OAuth → retour dans l’app → session créée, redirect OK. *(Expo Go : message explicite « build requis ».)*
- [ ] **Signup** – Création compte → redirect préservé après inscription.
- [ ] **Redirect après auth** – Depuis Favoris / Messages / Compte / Annonce / Conversation non connecté → login → après connexion retour sur l’écran d’origine.
- [ ] **Logout** – Compte → Se déconnecter → retour à l’écran de connexion ; session bien supprimée.

### Feed
- [ ] **Chargement** – Accueil affiche la liste d’annonces (ou vide/erreur).
- [ ] **Images** – Les photos des annonces s’affichent (pas de carré vide sauf si pas d’image).
- [ ] **Pull-to-refresh** – Rafraîchit la liste et les favoris.
- [ ] **Tap annonce** – Ouvre le détail de l’annonce.
- [ ] **Favoris (non connecté)** – Cœur sur une annonce → redirection vers login puis retour au feed.

### Search
- [ ] **Recherche** – Saisie requête → soumission → résultats (ou vide).
- [ ] **Tap résultat** – Ouvre le détail.
- [ ] **Favoris** – Cœur cohérent avec l’état favori après connexion.

### Listing detail
- [ ] **Chargement** – Galerie, titre, prix, ville, vendeur, description, boutons visibles.
- [ ] **Galerie** – Swipe entre les images, indicateur type « 1/3 ».
- [ ] **Favoris** – Cœur toggle, état persisté.
- [ ] **Contacter par message** – Redirige vers login si non connecté ; sinon ouvre la conversation.
- [ ] **WhatsApp** – Ouvre WhatsApp (ou wa.me) avec message pré-rempli ; si pas de numéro → wa.me avec texte seul.
- [ ] **Appeler** – Ouvre le téléphone (si numéro vendeur).
- [ ] **Partager** – Ouvre le share sheet natif ; contenu : titre, prix, lien youmbia.com/annonce/…
- [ ] **Signaler** – Non connecté → login ; connecté → modal motif → envoi → message de succès.
- [ ] **Annonce introuvable / plus disponible** – ID invalide ou annonce inactive → message clair + Retour.

### Favorites
- [ ] **Non connecté** – Redirection vers login avec redirect vers Favoris.
- [ ] **Connecté** – Liste des favoris (ou « Aucun favori ») ; pull-to-refresh.
- [ ] **Retrait favori** – Cœur sur une carte → l’annonce disparaît de la liste (ou état mis à jour).
- [ ] **Tap carte** – Ouvre le détail de l’annonce.

### Messages
- [ ] **Non connecté** – Redirection vers login avec redirect vers Messages.
- [ ] **Connecté** – Liste des conversations (ou « Aucun message ») ; pull-to-refresh.
- [ ] **Tap conversation** – Ouvre le fil de messages.
- [ ] **Envoi message** – Saisie → Envoyer → message apparaît ; en cas d’erreur, alerte affichée et texte conservé.
- [ ] **Clavier** – Le champ de saisie reste visible (pas recouvert par le clavier) sur iOS et Android.
- [ ] **Marquage lu** – Au retour sur le fil, le compteur non lu se met à jour (si backend le supporte).

### Account
- [ ] **Non connecté** – Message + bouton « Se connecter ».
- [ ] **Connecté** – Email affiché, lignes : Mes annonces, Favoris, Messages, Profil, Paramètres.
- [ ] **Mes annonces** – Liste des annonces du user ; statut En ligne / Hors ligne ; Voir, Modifier, Désactiver / Réactiver.
- [ ] **Profil / Paramètres** – Navigation OK, pas de crash.
- [ ] **Se déconnecter** – Retour à l’écran de connexion.

### Sell flow
- [ ] **Formulaire** – Titre, Prix, Ville, Description ; validation côté client (messages d’erreur clairs).
- [ ] **Photos** – « + Photo » → sélection galerie (multi) ; miniatures affichées ; suppression possible (✕).
- [ ] **Permission photos** – Refus → alerte explicative ; accord → sélection possible.
- [ ] **Publier** – Loading pendant création + upload ; succès → écran « Annonce publiée » avec Voir / Publier une autre / Retour accueil.
- [ ] **Erreur** – Message d’erreur affiché sous le formulaire.
- [ ] **Nouvelle annonce dans le feed** – Après publication, l’annonce apparaît dans l’onglet Accueil (rafraîchir si besoin).

### Image upload
- [ ] **Sélection** – Plusieurs images (jusqu’à 10) ; ordre conservé.
- [ ] **Upload** – Pas de crash ; après succès, les images sont visibles sur l’annonce (détail + feed).

### WhatsApp / Share
- [ ] **WhatsApp (détail annonce)** – Bouton vert ouvre l’app ou wa.me ; message pré-rempli cohérent.
- [ ] **Partager** – Share sheet avec titre, prix, lien ; pas de crash si l’utilisateur annule.
- [ ] **Contact indisponible / vendeur restreint** – Libellé « Contact non disponible » ou « Contact du vendeur indisponible » selon le cas.

### Logout / Session restore
- [ ] **Déconnexion** – Compte → Se déconnecter → session supprimée ; onglets protégés redirigent vers login.
- [ ] **Restauration session** – Fermeture de l’app puis réouverture → si session valide, l’utilisateur reste connecté (pas de retour login systématique).
- [ ] **Token expiré / invalide** – Comportement attendu (re-login) sans crash.

---

## 2. Remaining device-specific risks (from codebase review)

Identified from code only; to be validated or tuned on real devices.

| Risk | Where | Mitigation in code | What to test on device |
|------|--------|--------------------|-------------------------|
| **Deep linking** | OAuth redirect, scheme `youmbiamobile` | makeRedirectUri(), getSafeRedirect() for in-app redirects | Après Google login, l’app reprend bien le focus et la session ; redirect URL autorisée dans Supabase. |
| **Keyboard overlap** | Login, Signup, Sell, Search, Conversation | Screen `keyboardAvoid` (iOS padding), KeyboardAvoidingView sur conversation | Petit écran / clavier grand : champs et bouton Envoyer restent visibles ; pas de recouvrement gênant. |
| **Safe areas** | Tous les écrans, footer détail, tab bar, conversation input | useSafeAreaInsets(), paddingBottom avec insets | Pas de contenu sous le notch / barre d’accueil ; boutons et champs au-dessus de la zone sûre. |
| **Image picker** | Sell (galerie uniquement) | requestMediaLibraryPermissionsAsync, plugin expo-image-picker (permission FR) | Refus permission → alerte ; accord → sélection multi ; pas de crash sur « Annuler ». |
| **WhatsApp linking** | ListingActions | Linking.canOpenURL + openURL ; fallback wa.me/?text= | Avec/sans WhatsApp installé ; numéro normalisé (0x → 33) ; pas de crash si Linking échoue. |
| **Share behavior** | shareListing | Share.share (iOS title + message) ; fallback WhatsApp | Share sheet natif ; annulation sans crash ; fallback si share non supporté. |
| **Google login** | signInWithGoogle (dynamic import) | makeRedirectUri, WebBrowser.openAuthSessionAsync | En **Expo Go** : message « build requis ». En **dev build / preview** : OAuth complète et retour dans l’app. |
| **Images (signed URLs)** | Feed, détail, favoris | getSignedUrlsMap (1h TTL) | Sur réseau lent ou après longue inactivité : images se rechargent ou erreur propre (pas de crash). |

Aucun correctif de code n’a été jugé nécessaire pour ces points avant passage en QA ; les comportements actuels sont cohérents avec une utilisation device standard.

---

## 3. Fixes applied in this pass

**Aucun.** Aucun blocant évident ni correctif à faible risque strictement nécessaire n’a été identifié. Le projet est déjà en état pour une QA device (checklist ci-dessus + rapport release readiness).

---

## 4. Files changed

Aucun fichier modifié. Un seul livrable : ce document (checklist + risques + rapport).

---

## 5. Confirmation

- **Checklist** : Section 1 — à utiliser tel quel sur appareils réels / preview builds.
- **Risques device** : Section 2 — à valider ou affiner pendant la QA (deep link, clavier, safe areas, picker, WhatsApp, share, Google, images).
- **Stabilité** : Aucune régression introduite ; architecture et UX inchangés.

**Le projet est prêt pour la phase de Device QA** avec la checklist fournie et la liste des risques à surveiller.
