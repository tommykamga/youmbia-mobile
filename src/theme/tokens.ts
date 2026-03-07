/**
 * YOUMBIA design tokens – espacements, rayons, ombres, presets
 * Inspirés du web (Tailwind: p-4, rounded-2xl, shadow-soft, Button, ListingCard).
 * Adaptés pour React Native (valeurs numériques, shadow objects).
 */

import { colors } from './colors';
import { typography } from './typography';

// ─── Spacing (web: scale Tailwind 1 = 4px, 2 = 8px, 3 = 12px, 4 = 16px, …) ───
/** Échelle d’espacement (base 4px). Web: p-4 → spacing.base, gap-2 → spacing.sm, etc. */
export const spacing = {
  xs: 4,    // 1 (gap-1, p-1)
  sm: 8,    // 2 (gap-2, p-2, mt-2)
  md: 12,   // 3 (p-3, gap-3)
  base: 16, // 4 (p-4, px-4, web: padding cards/inputs)
  lg: 20,   // 5 (p-5)
  xl: 24,   // 6 (p-6, gap-6)
  '2xl': 32,  // 8 (gap-8)
  '3xl': 40,  // 10
  '4xl': 48,  // 12
  '5xl': 64,  // 16
} as const;

// ─── Border radius (web: rounded-md, rounded-xl, rounded-2xl, rounded-3xl) ───
/** Rayons de bordure. Web: rounded-md=6, rounded-lg=8, rounded-xl=12, rounded-2xl=1rem, rounded-3xl=24. */
export const radius = {
  none: 0,
  sm: 6,    // rounded-md (badges, chips)
  md: 8,    // rounded-lg
  lg: 12,   // rounded-xl (boutons, inputs web)
  xl: 16,   // rounded-2xl (cartes, ListingCard)
  '2xl': 16, // 1rem – alias cartes/boutons (tailwind.config borderRadius 2xl)
  '3xl': 24, // rounded-3xl (sections détail annonce)
  full: 9999,
} as const;

// ─── Ombres (web: shadow-sm, shadow-md, shadow-lg, boxShadow.soft) ─────────────
/** Ombres iOS + Android. Web: shadow-sm → sm, shadow-md → md, shadow-soft → soft, bouton primary → primary. */
export const shadows = {
  none: {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  sm: {
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  md: {
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 4,
  },
  /** Web: shadow-soft (tailwind.config boxShadow.soft) — cartes détail */
  soft: {
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 30,
    elevation: 8,
  },
  /** Bouton primary (focus / CTA) — teinte verte */
  primary: {
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 20,
    elevation: 6,
  },
} as const;

// ─── Presets bouton (web: components/Button.tsx – primary, secondary, ghost, danger) ─
export const buttonStyles = {
  /** primary: bg-youmbia-green, rounded-xl, shadow-sm → lg shadow-lg */
  primary: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    ...shadows.sm,
  },
  /** secondary: bg-white border-slate-200 */
  secondary: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    ...shadows.sm,
  },
  /** ghost: pas de fond ni bordure */
  ghost: {
    backgroundColor: 'transparent',
    borderRadius: radius.lg,
  },
  /** danger: bg-red-600 (couleur sémantique) */
  danger: {
    backgroundColor: colors.error,
    borderRadius: radius.lg,
    ...shadows.sm,
  },
} as const;

// ─── Presets carte (web: ListingCard, annonce/[id] — rounded-2xl border bg-white shadow-sm) ─
export const cardStyles = {
  /** Carte standard: rounded-2xl border border-slate-100 bg-white shadow-sm */
  default: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: radius.xl,
    ...shadows.sm,
  },
  /** Carte élevée: border-slate-200 shadow-soft (détail annonce) */
  elevated: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius['3xl'],
    ...shadows.soft,
  },
  /** Carte subtile: bg-slate-50 border-slate-100 (zones secondaires) */
  subtle: {
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: radius.xl,
  },
} as const;

/** Theme complet pour contexte ou usage direct. */
export const tokens = {
  colors,
  spacing,
  radius,
  typography,
  fontWeights: typography.fontWeights,
  shadows,
  buttonStyles,
  cardStyles,
} as const;

export type Theme = typeof tokens;
