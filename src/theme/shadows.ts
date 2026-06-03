/**
 * Ombres premium YOUMBIA — iOS (shadow*) / Android (elevation uniquement).
 * Ne jamais appliquer `elevation` sur iOS.
 */

import { Platform, type ViewStyle } from 'react-native';

/** Teinte ombre cartes marketplace (slate-900). */
export const SHADOW_COLOR_SLATE = '#0F172A';

export type ShadowLevel = 'subtle' | 'card' | 'floating' | 'sticky';

const IOS_SHADOWS: Record<ShadowLevel, ViewStyle> = {
  /** Puces, chips, cellules catégories. */
  subtle: {
    shadowColor: SHADOW_COLOR_SLATE,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
  },
  /** Cartes grille / listes (ListingCard, ShopCard). */
  card: {
    shadowColor: SHADOW_COLOR_SLATE,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
  },
  /** Cartes home, rails mis en avant, surfaces flottantes. */
  floating: {
    shadowColor: SHADOW_COLOR_SLATE,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
  },
  /** Barres fixes en bas de fiche (ListingActions). */
  sticky: {
    shadowColor: SHADOW_COLOR_SLATE,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
  },
};

/** Élévations Android calibrées (évite 0–1 trop plat et 8+ trop massif). */
export const ANDROID_ELEVATION: Record<ShadowLevel, number> = {
  subtle: 2,
  card: 3,
  floating: 5,
  sticky: 6,
};

export type ShadowStyleOptions = {
  /** Couleur d’ombre iOS (ex. badge boosté). */
  shadowColor?: string;
  /** Ajustements fins iOS sans changer la taille de carte. */
  ios?: Partial<{
    shadowOffset: NonNullable<ViewStyle['shadowOffset']>;
    shadowOpacity: number;
    shadowRadius: number;
  }>;
  /** Surcharge elevation Android (ex. cellule catégorie). */
  androidElevation?: number;
};

function buildIosShadow(level: ShadowLevel, options?: ShadowStyleOptions): ViewStyle {
  return {
    ...IOS_SHADOWS[level],
    ...(options?.shadowColor != null ? { shadowColor: options.shadowColor } : {}),
    ...(options?.ios ?? {}),
  };
}

/**
 * Style d’ombre pour un niveau donné.
 * iOS : shadowColor / shadowOpacity / shadowRadius / shadowOffset (pas d’elevation).
 * Android : elevation uniquement.
 */
export function getShadowStyle(level: ShadowLevel, options?: ShadowStyleOptions): ViewStyle {
  if (Platform.OS === 'android') {
    return {
      elevation: options?.androidElevation ?? ANDROID_ELEVATION[level],
    };
  }
  if (Platform.OS === 'ios') {
    return buildIosShadow(level, options);
  }
  return {};
}

/** Presets pour StyleSheet (évalués au chargement du bundle). */
export const platformShadow = {
  subtle: getShadowStyle('subtle'),
  card: getShadowStyle('card'),
  floating: getShadowStyle('floating'),
  sticky: getShadowStyle('sticky'),
} as const satisfies Record<ShadowLevel, ViewStyle>;
