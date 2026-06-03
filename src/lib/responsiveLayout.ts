/**
 * Breakpoints UI (largeur logique) — Home, tabs, fiches, sans logique métier.
 * compact: petits Android / iPhone SE ; regular: majorité ; large: Pro Max, tablettes étroites.
 *
 * Aligné produit : petit téléphone < 380 ; moyen [380, 430) ; grand ≥ 430.
 */
import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';
import { spacing } from '@/theme';

export type WindowSizeBucket = 'compact' | 'regular' | 'large';

/** < 380 → compact (petit téléphone). */
const WIDTH_COMPACT_BOUND = 380;
const WIDTH_REGULAR_BOUND = 430;

export type PhoneSizeFlags = {
  isSmallPhone: boolean;
  isMediumPhone: boolean;
  isLargePhone: boolean;
};

export function getPhoneSizeFlags(width: number): PhoneSizeFlags {
  return {
    isSmallPhone: width < WIDTH_COMPACT_BOUND,
    isMediumPhone: width >= WIDTH_COMPACT_BOUND && width < WIDTH_REGULAR_BOUND,
    isLargePhone: width >= WIDTH_REGULAR_BOUND,
  };
}

export function getWindowSizeBucket(width: number): WindowSizeBucket {
  if (width < WIDTH_COMPACT_BOUND) return 'compact';
  if (width < WIDTH_REGULAR_BOUND) return 'regular';
  return 'large';
}

/** Métriques tab bar (hors safe area bottom) — harmonisées petit / grand écran. */
export type TabBarVisualMetrics = {
  barHeight: number;
  labelFontSize: number;
  /** Taille Ionicons standard (21–22). */
  tabIconSize: number;
  /** Espacement icône → label (3–5). */
  tabIconMarginBottom: number;
  paddingTop: number;
};

export function getTabBarVisualMetrics(width: number): TabBarVisualMetrics {
  if (width < WIDTH_COMPACT_BOUND) {
    return {
      barHeight: 59,
      labelFontSize: 10,
      tabIconSize: 21,
      tabIconMarginBottom: 4,
      paddingTop: 6,
    };
  }
  if (width >= WIDTH_REGULAR_BOUND) {
    return {
      barHeight: 61,
      labelFontSize: 11,
      tabIconSize: 22,
      tabIconMarginBottom: 4,
      paddingTop: 6,
    };
  }
  return {
    barHeight: 60,
    labelFontSize: 10,
    tabIconSize: 21,
    tabIconMarginBottom: 4,
    paddingTop: 6,
  };
}

/** Réserve scroll pour ne pas masquer les cartes sous la tab bar (contenu + safe bottom + marge). */
export function getScrollBottomReserveForTabBar(width: number, safeAreaBottom: number): number {
  return getTabBarVisualMetrics(width).barHeight + safeAreaBottom + 12;
}

/**
 * Gouttière horizontale marketplace (recherche, catégories, rails, titres, cartes).
 * @deprecated Préférer `spacing.screenHorizontal` ; conservé pour compat des hooks existants.
 */
export function getHomeMarketplaceHorizontalPadding(_width?: number): number {
  return spacing.screenHorizontal;
}

/** @deprecated Alias — préférer `getHomeMarketplaceHorizontalPadding`. */
export const getHomeFeedListingCardInset = getHomeMarketplaceHorizontalPadding;

/** @deprecated Alias — préférer `getHomeMarketplaceHorizontalPadding`. */
export const getHomeMarketplaceGridInset = getHomeMarketplaceHorizontalPadding;

export function useHomeMarketplaceHorizontalPadding(): number {
  const { width } = useWindowDimensions();
  return useMemo(() => getHomeMarketplaceHorizontalPadding(width), [width]);
}

/** @deprecated Alias — préférer `useHomeMarketplaceHorizontalPadding`. */
export const useHomeMarketplaceGridInset = useHomeMarketplaceHorizontalPadding;

export function useResponsiveLayout() {
  const { width, height } = useWindowDimensions();
  const bucket = getWindowSizeBucket(width);
  const phone = getPhoneSizeFlags(width);
  return {
    width,
    height,
    bucket,
    isCompact: bucket === 'compact',
    isRegular: bucket === 'regular',
    isLarge: bucket === 'large',
    ...phone,
  };
}

/** Placeholder barre de recherche Home — une ligne sur petits écrans. */
export function getHomeSearchPlaceholder(bucket: WindowSizeBucket): string {
  return 'Que recherchez-vous ?';
}
