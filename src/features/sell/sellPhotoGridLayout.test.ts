import { describe, expect, it } from 'vitest';
import {
  SELL_PHOTO_GRID_GAP,
  computeSellPhotoGridLayout,
  estimateSellPhotoGridContainerWidth,
} from './sellPhotoGridLayout';

describe('sellPhotoGridLayout', () => {
  it('forme une grille 2×2 sur iPhone standard (390 pt, inset 16)', () => {
    const container = estimateSellPhotoGridContainerWidth(390, 16);
    expect(container).toBe(358);
    const layout = computeSellPhotoGridLayout(container);
    expect(layout.columns).toBe(2);
    expect(layout.slotSize * 2 + SELL_PHOTO_GRID_GAP).toBeLessThanOrEqual(container);
    expect(layout.slotSize * 2 + SELL_PHOTO_GRID_GAP).toBeGreaterThanOrEqual(container - 1);
  });

  it('ne dépasse pas la largeur utile (régression empilement vertical)', () => {
    for (const w of [320, 358, 390, 414, 520]) {
      const layout = computeSellPhotoGridLayout(w);
      if (layout.columns === 2) {
        expect(layout.slotSize * 2 + layout.gap).toBeLessThanOrEqual(w);
      } else {
        expect(layout.slotSize).toBeLessThanOrEqual(w);
      }
    }
  });

  it('passe en une colonne si la largeur utile est trop faible', () => {
    const layout = computeSellPhotoGridLayout(260);
    expect(layout.columns).toBe(1);
  });

  it('estimate ne double pas le padding contenu parent', () => {
    const once = estimateSellPhotoGridContainerWidth(390, 16);
    expect(once).toBe(358);
    expect(once).not.toBe(390 - 16 * 4);
  });
});
