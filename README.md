# YOUMBIA Mobile

Application mobile React Native (Expo) pour YOUMBIA – marketplace au Cameroun.

## Prérequis

- Node.js 18+
- npm ou yarn
- Expo Go (iOS/Android) ou simulateur

## Installation

```bash
cd youmbia-mobile
npm install
cp .env.example .env   # puis renseigner les clés Supabase si besoin
npm start
```

Puis scanner le QR code avec Expo Go ou lancer `npm run ios` / `npm run android`.

## Structure du projet

```
youmbia-mobile/
├── app/                    # Expo Router (file-based)
│   ├── _layout.tsx         # Layout racine (Stack, StatusBar)
│   ├── index.tsx           # Redirection vers (tabs)/home
│   ├── +not-found.tsx      # 404
│   ├── (auth)/             # Groupe auth (non protégé pour l’instant)
│   │   ├── _layout.tsx
│   │   ├── login.tsx
│   │   └── signup.tsx
│   ├── (tabs)/             # Bottom tabs
│   │   ├── _layout.tsx     # Tabs (Accueil, Recherche, Favoris, Messages, Compte)
│   │   ├── home.tsx
│   │   ├── search.tsx
│   │   ├── favorites.tsx
│   │   ├── messages.tsx
│   │   └── account.tsx
│   ├── listing/
│   │   └── [id].tsx        # Détail annonce (placeholder)
│   └── sell/
│       └── index.tsx       # Vendre (placeholder)
├── src/
│   ├── components/         # Composants réutilisables
│   │   ├── Screen.tsx      # Conteneur écran (safe area, scroll, padding)
│   │   ├── Button.tsx      # Bouton (primary, secondary, outline, ghost)
│   │   └── index.ts
│   ├── theme/              # Design tokens
│   │   ├── colors.ts       # Couleurs YOUMBIA (primary #16A34A, etc.)
│   │   ├── tokens.ts       # spacing, radius, typography, shadows
│   │   └── index.ts
│   ├── lib/
│   │   └── supabase.ts     # Client Supabase (préparé)
│   ├── types/
│   │   └── database.ts     # Types Supabase (à générer)
│   ├── features/           # (vide, prêt pour features)
│   ├── services/           # (vide)
│   ├── hooks/              # (vide)
│   └── utils/              # (vide)
├── components/             # Anciens composants template (Expo), à ignorer
├── constants/              # Ancien Colors template, à ignorer
├── .env.example
├── app.json
├── package.json
└── tsconfig.json
```

## Identité visuelle

- **Couleur principale** : `#16A34A` (vert YOUMBIA)
- **Fond** : `#F8FAFC`
- **Texte** : `#0F172A`
- **Surfaces** : blanc, bordures légères

Tokens dans `src/theme/` : `colors`, `spacing`, `radius`, `typography`, `fontWeights`, `shadows`.

## Dépendances installées

- **expo** ~55, **expo-router** ~55, **react**, **react-native**
- **@supabase/supabase-js** – client Supabase
- **react-native-url-polyfill** – requis pour Supabase en RN
- **react-native-safe-area-context**, **react-native-screens**, **expo-symbols**, etc.

## Supabase

1. Copier `.env.example` en `.env`.
2. Renseigner `EXPO_PUBLIC_SUPABASE_URL` et `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
3. Générer les types :  
   `npx supabase gen types typescript --project-id <id> > src/types/database.ts`

## Hypothèses

- Le projet est dans le dossier `youmbia-mobile` (nom URL-friendly) ; le workspace parent peut rester « Youmbia -mobile ».
- Pas de logique métier pour l’instant : écrans en placeholders, pas d’auth réelle ni d’appels API.
- L’auth est un stack séparé `(auth)` ; la redirection racine va vers `(tabs)/home`. Un garde d’auth pourra être ajouté plus tard.
- Les icônes des onglets utilisent `expo-symbols` (SF Symbols / Material) avec un fallback par plateforme.
- Alias TypeScript : `@/*` → `src/*` (composants et thème dans `src/`).

## Commandes

- `npm start` – démarrer Expo
- `npm run ios` – simulateur iOS
- `npm run android` – simulateur / appareil Android
- `npm run web` – build web
