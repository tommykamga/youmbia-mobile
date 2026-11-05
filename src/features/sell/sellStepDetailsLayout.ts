import { spacing } from '@/theme';

/** Grille catégories racines — 3 colonnes téléphone (9 tuiles), plus large sur tablette. */
export function getSellCategoryColumnCount(screenWidth: number): number {
  if (screenWidth >= 900) return 5;
  if (screenWidth >= 600) return 4;
  return 3;
}

export function getSellCategoryCardWidth(screenWidth: number, columns: number): number {
  const contentMaxWidth = 520;
  const horizontalPadding = spacing.screenHorizontal * 2;
  const gridGap = 5;
  const contentWidth = Math.min(screenWidth, contentMaxWidth) - horizontalPadding;
  const totalGap = gridGap * Math.max(0, columns - 1);
  return Math.max(44, Math.floor((contentWidth - totalGap) / columns));
}

export const SELL_CATEGORY_GRID_GAP = 5;
export const SELL_CATEGORY_CARD_MIN_HEIGHT = 52;
