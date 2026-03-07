/**
 * YOUMBIA design tokens – typographie
 * Inspiré de app/globals.css (@layer components: .heading-page, .heading-section, etc.)
 * et de l'échelle Tailwind (text-xs → text-4xl). Adapté pour React Native.
 */

/** Échelle de base (équivalent Tailwind text-xs → text-4xl). */
export const fontScale = {
  xs: { fontSize: 12, lineHeight: 16 },   // text-xs
  sm: { fontSize: 14, lineHeight: 20 },   // text-sm
  base: { fontSize: 16, lineHeight: 24 }, // text-base
  lg: { fontSize: 18, lineHeight: 28 },  // text-lg
  xl: { fontSize: 20, lineHeight: 28 },   // text-xl
  '2xl': { fontSize: 24, lineHeight: 32 }, // text-2xl
  '3xl': { fontSize: 30, lineHeight: 36 }, // text-3xl
  '4xl': { fontSize: 36, lineHeight: 40 }, // text-4xl
} as const;

/** Poids (numeric pour React Native). Web: font-medium, font-bold, font-black. */
export const fontWeights = {
  normal: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
  black: '800' as const,
} as const;

/** Hiérarchie des titres – inspirée de globals.css .heading-* */
export const headings = {
  /** .heading-page — H1 hero (text-3xl sm:text-4xl md:text-5xl font-black) */
  page: {
    ...fontScale['4xl'],
    fontWeight: fontWeights.black,
    letterSpacing: -0.5,
  },
  /** .heading-section — H2 (text-2xl font-black) */
  section: {
    ...fontScale['2xl'],
    fontWeight: fontWeights.black,
    letterSpacing: -0.3,
  },
  /** .heading-subsection — H3 (text-lg font-bold) */
  subsection: {
    ...fontScale.lg,
    fontWeight: fontWeights.bold,
    letterSpacing: -0.2,
  },
  /** .heading-card — titres de cartes (text-base font-bold) */
  card: {
    ...fontScale.base,
    fontWeight: fontWeights.bold,
  },
} as const;

/** Prix – .price-display, .price-card, .price-detail (couleur appliquée côté composant). */
export const price = {
  /** .price-card — prix sur carte (text-2xl font-black) */
  card: {
    ...fontScale['2xl'],
    fontWeight: fontWeights.black,
    letterSpacing: -0.3,
  },
  /** .price-detail — prix détail (text-3xl sm:text-4xl font-black) */
  detail: {
    ...fontScale['3xl'],
    fontWeight: fontWeights.black,
    letterSpacing: -0.3,
  },
  /** .price-display — petit prix / inline (font-black) */
  display: {
    ...fontScale.base,
    fontWeight: fontWeights.black,
    letterSpacing: -0.2,
  },
} as const;

/** Labels / badges (web: text-[10px] font-bold uppercase tracking-widest, etc.) */
export const label = {
  /** Badge petit (badge-verified, badge-boost, text-[10px] font-bold) */
  badge: {
    fontSize: 10,
    lineHeight: 14,
    fontWeight: fontWeights.bold,
    letterSpacing: 0.5,
  },
  /** Label uppercase (text-xs font-bold uppercase tracking-wider) */
  caption: {
    ...fontScale.xs,
    fontWeight: fontWeights.bold,
    letterSpacing: 0.8,
  },
  /** Overline (text-xs font-bold text-slate-400 uppercase tracking-widest) */
  overline: {
    ...fontScale.xs,
    fontWeight: fontWeights.bold,
    letterSpacing: 1.2,
  },
} as const;

/** Export unifié pour usage dans tokens et composants (rétrocompatibilité). */
export const typography = {
  ...fontScale,
  fontWeights,
  headings,
  price,
  label,
} as const;

export type Typography = typeof typography;
export type FontScale = typeof fontScale;
export type Headings = typeof headings;
