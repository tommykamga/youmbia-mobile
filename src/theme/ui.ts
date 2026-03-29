/**
 * Design system YOUMBIA — tokens UI sémantiques (source de vérité unique).
 *
 * Les valeurs pointent vers le thème primitif existant (`colors`, `tokens`, `typography`)
 * pour éviter la dérive et ne pas casser les imports actuels.
 *
 * Convention : préférer `ui` pour les nouveaux écrans / refactors ciblés ;
 * l’existant peut continuer à utiliser `colors`, `spacing`, etc.
 */

import type { TextStyle, ViewStyle } from 'react-native';
import { colors } from './colors';
import { typography, fontWeights } from './typography';
import { spacing as space, radius as rad, shadows } from './tokens';

// ─── Couleurs (base claire, vert primary, contraste sobre) ───────────────────

export const uiColors = {
  background: colors.background,
  surface: colors.surface,
  surfaceSubtle: colors.surfaceSubtle,
  textPrimary: colors.text,
  textSecondary: colors.textSecondary,
  textMuted: colors.textMuted,
  primary: colors.primary,
  /** Fond / halo vert léger (équivalent primaryLight / focus doux). */
  primarySoft: colors.primaryLight,
  border: colors.border,
  borderLight: colors.borderLight,
  success: colors.success,
  danger: colors.error,
} as const;

// ─── Spacing (échelle réduite xs → xl) ───────────────────────────────────────

export const uiSpacing = {
  xs: space.xs,
  sm: space.sm,
  md: space.md,
  lg: space.base,
  xl: space.xl,
} as const;

// ─── Radius ─────────────────────────────────────────────────────────────────

export const uiRadius = {
  sm: rad.sm,
  md: rad.md,
  lg: rad.lg,
  xl: rad.xl,
  pill: rad.full,
} as const;

// ─── Typographie (styles compatibles Text) ───────────────────────────────────

export const uiTypography = {
  hero: {
    ...typography['3xl'],
    fontWeight: fontWeights.black,
    letterSpacing: -0.4,
    color: uiColors.textPrimary,
  } satisfies TextStyle,
  h1: {
    ...typography['2xl'],
    fontWeight: fontWeights.black,
    letterSpacing: -0.35,
    color: uiColors.textPrimary,
  } satisfies TextStyle,
  h2: {
    ...typography.lg,
    fontWeight: fontWeights.bold,
    letterSpacing: -0.2,
    color: uiColors.textPrimary,
  } satisfies TextStyle,
  body: {
    ...typography.base,
    fontWeight: fontWeights.normal,
    color: uiColors.textPrimary,
  } satisfies TextStyle,
  bodySmall: {
    ...typography.sm,
    fontWeight: fontWeights.normal,
    color: uiColors.textPrimary,
  } satisfies TextStyle,
  caption: {
    ...typography.xs,
    fontWeight: fontWeights.medium,
    color: uiColors.textMuted,
  } satisfies TextStyle,
  /** Titre de bouton (couleur selon variant : `surface` sur primary, `primary` sur outline, etc.). */
  button: {
    ...typography.base,
    fontWeight: fontWeights.bold,
    letterSpacing: 0.3,
  } satisfies TextStyle,
} as const;

// ─── Ombres (2 niveaux + none) — ViewStyle fragments ─────────────────────────

export const uiShadow = {
  none: shadows.none,
  /** Cartes listes, surfaces flottantes légères. */
  soft: shadows.card,
  /** Élévation modérée (modales, CTA). */
  medium: shadows.md,
} as const satisfies Record<string, ViewStyle>;

// ─── Objet unique `ui` (consommation préférée) ─────────────────────────────

export const ui = {
  colors: uiColors,
  spacing: uiSpacing,
  radius: uiRadius,
  typography: uiTypography,
  shadow: uiShadow,
} as const;

export type UIColors = typeof uiColors;
export type UISpacing = typeof uiSpacing;
export type UIRadius = typeof uiRadius;
export type UITypography = typeof uiTypography;
export type UIShadow = typeof uiShadow;
export type UI = typeof ui;
