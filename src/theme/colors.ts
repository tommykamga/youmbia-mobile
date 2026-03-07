/**
 * YOUMBIA design tokens – couleurs
 * Aligné avec l'identité web (Tailwind: youmbia.*, slate-*, emerald-*, etc.)
 * Adapté pour React Native (pas de classes Tailwind en 1:1).
 */

// ─── Brand (tailwind.config.ts: theme.extend.colors.youmbia) ─────────────────
/** Vert principal YOUMBIA – boutons CTA, liens, états actifs */
export const brand = {
  primary: '#16A34A',       // youmbia.green
  primaryDark: '#15803D',   // green-700 hover (Button primary web)
  primaryLight: '#DCFCE7',  // green-100 (badges, focus ring)
  navy: '#0F172A',         // youmbia.navy – texte principal, ombres
  offwhite: '#F8FAFC',      // youmbia.offwhite / --background (globals.css)
  black: '#0B0B0B',        // youmbia.black
} as const;

// ─── Neutres (slate-* sur le web) ───────────────────────────────────────────
export const neutral = {
  50: '#F8FAFC',   // slate-50, background global
  100: '#F1F5F9',  // slate-100 – bordures légères, surfaces secondaires
  200: '#E2E8F0',  // slate-200 – bordures inputs, cartes
  300: '#CBD5E1',  // slate-300 – séparateurs, breadcrumb
  400: '#94A3B8',  // slate-400 – icônes secondaires, placeholder
  500: '#64748B',  // slate-500 – texte secondaire, captions
  600: '#475569',  // slate-600 – texte secondaire fort, badges
  700: '#334155',  // slate-700 – ghost button text
  800: '#1E293B',  // slate-800 – sous-titres
  900: '#0F172A',  // slate-900 – titre, foreground (globals.css --foreground)
} as const;

// ─── Couleurs sémantiques (success / warning / error / info) ─────────────────
/** Success: Vérifié, identifié, états positifs (green-* / emerald-* web) */
export const semantic = {
  success: '#16A34A',       // youmbia-green / green-600
  successLight: '#DCFCE7',  // green-100 (badge-verified)
  successText: '#166534',   // green-800 (badge-verified text)
  warning: '#D97706',       // amber-600 / warning
  warningLight: '#FEF3C7',  // amber-100 (badge-flagged, badge-boost)
  warningText: '#92400E',   // amber-800
  error: '#DC2626',         // red-600 (Button danger web)
  errorDark: '#B91C1C',     // red-700 hover
  errorLight: '#FEE2E2',    // red-100
  info: '#0EA5E9',          // sky-500
  boost: '#059669',         // emerald-600 (badge Boost Premium)
  boostLight: '#ECFDF5',    // emerald-50 (badge bg)
  boostText: '#047857',     // emerald-700
} as const;

// ─── Surface & texte (mapping direct pour composants) ────────────────────────
export const colors = {
  // Brand
  primary: brand.primary,
  primaryDark: brand.primaryDark,
  primaryLight: brand.primaryLight,

  // Backgrounds (web: bg-[var(--background)], bg-white, bg-slate-50/100)
  background: brand.offwhite,
  surface: '#FFFFFF',
  surfaceSubtle: neutral[50],
  surfaceMuted: neutral[100],

  // Text (web: text-slate-900, text-slate-600/500/400)
  text: neutral[900],
  textSecondary: neutral[600],
  textMuted: neutral[500],
  textTertiary: neutral[400],

  // Borders (web: border-slate-200, border-slate-100)
  border: neutral[200],
  borderLight: neutral[100],

  // Semantic (réexport pour usage direct)
  success: semantic.success,
  successLight: semantic.successLight,
  warning: semantic.warning,
  warningLight: semantic.warningLight,
  error: semantic.error,
  errorLight: semantic.errorLight,
  info: semantic.info,

  // Tab bar & UI (web: icônes slate-400, actif youmbia-green)
  tabIconDefault: neutral[400],
  tabIconSelected: brand.primary,
  tint: brand.primary,

  // Badges / chips (référence: globals.css .badge-*, ListingCard)
  badgeVerifiedBg: semantic.successLight,
  badgeVerifiedText: semantic.successText,
  badgeBoostBg: semantic.boostLight,
  badgeBoostText: semantic.boostText,
  badgeNeutralBg: neutral[100],
  badgeNeutralText: neutral[600],
  badgeWarningBg: semantic.warningLight,
  badgeWarningText: semantic.warningText,
} as const;

export type Colors = typeof colors;
export type Brand = typeof brand;
export type Neutral = typeof neutral;
export type Semantic = typeof semantic;
