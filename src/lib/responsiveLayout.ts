/**
 * Breakpoints UI (largeur logique) — Home, tabs, fiches, sans logique métier.
 * compact: petits Android / iPhone SE ; regular: majorité ; large: Pro Max, tablettes étroites.
 *
 * Aligné produit : petit téléphone < 380 ; moyen [380, 430) ; grand ≥ 430.
 */
import { useMemo } from 'react';
import { PixelRatio, useWindowDimensions } from 'react-native';
import { spacing } from '@/theme';

/** Espacement horizontal entre cartes du fil accueil (grille 2 colonnes). */
export const HOME_FEED_GRID_COLUMN_GAP = spacing.sm;

/**
 * Au-delà de ce ratio de police système, le fil accueil repasse en 1 colonne
 * (Dynamic Type / texte agrandi iOS & Android).
 */
export const HOME_FEED_GRID_MAX_FONT_SCALE = 1.2;

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

/** Colonnes du fil d’accueil (cartes) : 2 si largeur suffisante et texte OS normal, sinon 1. */
export function getHomeFeedColumnCount(
  width: number,
  fontScale: number = PixelRatio.getFontScale()
): 1 | 2 {
  if (width < WIDTH_COMPACT_BOUND) return 1;
  if (fontScale > HOME_FEED_GRID_MAX_FONT_SCALE) return 1;
  return 2;
}

const HOME_FEED_LIST_MAX_WIDTH = 760;

/** Largeur utile du conteneur liste (aligné maxWidth des onglets marketplace). */
export function getHomeFeedListContentWidth(windowWidth: number): number {
  return Math.min(windowWidth, HOME_FEED_LIST_MAX_WIDTH);
}

/** Largeur intérieure d’une rangée grille après gouttières `screenHorizontal`. */
export function getHomeFeedGridInnerWidth(windowWidth: number): number {
  return getHomeFeedListContentWidth(windowWidth) - spacing.screenHorizontal * 2;
}

/** Largeur d’une cellule en grille 2 colonnes (inter-colonne = `HOME_FEED_GRID_COLUMN_GAP`). */
export function getHomeFeedTwoColumnCellWidth(gridInnerWidth: number): number {
  return (gridInnerWidth - HOME_FEED_GRID_COLUMN_GAP) / 2;
}

export type HomeFeedGridCellLayoutStyle = {
  flex: number;
  width?: number;
  minWidth: number;
};

/**
 * Évite qu’une carte seule en grille 2 col. s’étire sur toute la rangée (dernière ligne impaire).
 */
export function getHomeFeedGridCellLayout(
  gridInnerWidth: number,
  columnCount: 1 | 2,
  cellsInRow: number
): HomeFeedGridCellLayoutStyle {
  const minWidth = 0;
  if (columnCount === 1 || cellsInRow >= 2) {
    return { flex: 1, minWidth };
  }
  return {
    flex: 0,
    width: getHomeFeedTwoColumnCellWidth(gridInnerWidth),
    minWidth,
  };
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
  const fontScale = PixelRatio.getFontScale();
  return {
    width,
    height,
    bucket,
    fontScale,
    homeFeedColumns: getHomeFeedColumnCount(width, fontScale),
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
