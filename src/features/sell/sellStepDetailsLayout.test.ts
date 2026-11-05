import { describe, expect, it } from 'vitest';
import {
  getSellCategoryCardWidth,
  getSellCategoryColumnCount,
  SELL_CATEGORY_CARD_MIN_HEIGHT,
} from './sellStepDetailsLayout';

describe('sellStepDetailsLayout', () => {
  it('utilise 3 colonnes sur téléphone pour neuf tuiles', () => {
    expect(getSellCategoryColumnCount(390)).toBe(3);
    expect(getSellCategoryColumnCount(599)).toBe(3);
  });

  it('calcule une largeur de tuile ≥ 44 pt', () => {
    const w = getSellCategoryCardWidth(390, 3);
    expect(w).toBeGreaterThanOrEqual(44);
    expect(SELL_CATEGORY_CARD_MIN_HEIGHT).toBeGreaterThanOrEqual(44);
  });
});
