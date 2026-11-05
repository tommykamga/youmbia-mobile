/** Grille photos Vendre — layout pur (tests + onLayout). */

export const SELL_PHOTO_GRID_GAP = 8;

/** En dessous : une colonne (Dynamic Type / écran étroit). */
export const SELL_PHOTO_GRID_MIN_TWO_COL_WIDTH = 280;

export const SELL_PHOTO_GRID_MIN_SLOT = 96;

export type SellPhotoGridColumns = 1 | 2;

export type SellPhotoGridLayout = {
  columns: SellPhotoGridColumns;
  slotSize: number;
  gap: number;
};

/**
 * @param containerInnerWidth Largeur utile du conteneur grille (sans padding parent).
 */
export function computeSellPhotoGridLayout(containerInnerWidth: number): SellPhotoGridLayout {
  const gap = SELL_PHOTO_GRID_GAP;
  const w = Math.max(0, Math.floor(containerInnerWidth));

  if (w < SELL_PHOTO_GRID_MIN_TWO_COL_WIDTH) {
    const slotSize = Math.max(SELL_PHOTO_GRID_MIN_SLOT, w);
    return { columns: 1, slotSize, gap };
  }

  let slotSize = Math.floor((w - gap) / 2);
  slotSize = Math.max(SELL_PHOTO_GRID_MIN_SLOT, slotSize);

  if (slotSize * 2 + gap > w) {
    slotSize = Math.max(SELL_PHOTO_GRID_MIN_SLOT, Math.floor((w - gap) / 2));
  }

  return { columns: 2, slotSize, gap };
}

/** Estimation avant onLayout : contenu déjà inset (padding horizontal parent). */
export function estimateSellPhotoGridContainerWidth(screenWidth: number, horizontalInset: number): number {
  return Math.max(0, Math.floor(Math.min(screenWidth, 520) - horizontalInset * 2));
}
