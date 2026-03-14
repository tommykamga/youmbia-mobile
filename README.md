# YOUMBIA Mobile

Application mobile React Native (Expo) pour YOUMBIA – marketplace au Cameroun.

## Prérequis

- Node.js 18+
- npm
- Expo Go (iOS/Android) ou simulateur

## Installation

```bash
git clone https://github.com/tommykamga/youmbia-mobile.git
cd youmbia-mobile
npm install
cp .env.example .env   # puis renseigner les clés Supabase
npm start
```

Puis scanner le QR code avec Expo Go, ou lancer `npm run ios` / `npm run android`.

## Scripts

| Commande | Description |
|----------|-------------|
| `npm start` | Démarrer Expo (Metro) |
| `npm run ios` | Lancer sur simulateur iOS |
| `npm run android` | Lancer sur appareil / simulateur Android |
| `npm run web` | Build / preview web |

## EAS Build (Expo Application Services)

Le projet est configuré pour les builds cloud EAS. Prérequis : [EAS CLI](https://docs.expo.dev/build/setup/#install-eas-cli) (`npm install -g eas-cli`).

**Première fois** : se connecter et lier le projet :

```bash
eas login
eas build:configure   # déjà fait si eas.json existe
```

**Profils disponibles** (`eas.json`) :

| Profil | Usage | iOS | Android |
|--------|--------|-----|---------|
| `development` | Tests rapides, simulateur | Simulateur | APK |
| `preview` | Tests internes / QA | Build device (internal) | APK |
| `production` | App Store / Play Store | IPA (store) | AAB (bundle) |

**Lancer un build** :

```bash
eas build --profile development --platform ios
eas build --profile development --platform android
eas build --profile preview --platform all
eas build --profile production --platform all
```

**Identifiants** : `app.json` contient `ios.bundleIdentifier` et `android.package` (`com.youmbia.mobile`). Pour soumettre aux stores, renseigner les champs dans `eas.json` > `submit.production` (Apple ID, Team ID, compte de service Google Play) ou utiliser `eas submit` interactif.

## Variables d'environnement

Créer un fichier `.env` à la racine (voir `.env.example`) avec :

- `EXPO_PUBLIC_SUPABASE_URL` – URL du projet Supabase
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` – clé anonyme Supabase

Ne pas commiter `.env` (déjà ignoré par Git).

## Structure principale

```
app/                 # Expo Router (file-based)
├── (tabs)/          # Accueil, Recherche, Favoris, Messages, Compte
├── (auth)/          # Login, Signup
├── listing/[id].tsx # Fiche annonce
├── sell/            # Déposer une annonce
└── account/         # Mes annonces, etc.

src/
├── components/      # Screen, Button, Input, Loader, etc.
├── features/        # listings (ListingCard, ListingFeed, ListingGallery…)
├── services/        # auth, listings, favorites, reports, conversations…
├── lib/             # supabase, format, shareListing
├── theme/           # colors, tokens, typography
└── utils/           # formatPrice, timeAgo
```

## Identité visuelle

- **Couleur principale** : `#16A34A` (vert YOUMBIA)
- **Fond** : `#F8FAFC`
- Tokens : `src/theme/` (colors, spacing, radius, typography, shadows)

## Repo

Dépôt : [github.com/tommykamga/youmbia-mobile](https://github.com/tommykamga/youmbia-mobile)
