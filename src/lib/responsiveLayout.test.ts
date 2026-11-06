import { describe, expect, it } from 'vitest';
import { buildHomeFeedGridRows } from '@/features/listings/homeFeedGridRows';
import {
  getHomeFeedColumnCount,
  getHomeFeedGridCellLayout,
  getHomeFeedGridInnerWidth,
  getHomeFeedTwoColumnCellWidth,
  getListingCardGridColumnCount,
  getListingCardGridInnerWidth,
  HOME_FEED_GRID_COLUMN_GAP,
  HOME_FEED_GRID_MAX_FONT_SCALE,
  LISTING_CARD_GRID_MIN_CELL_WIDTH_DP,
} from './responsiveLayout';
import { spacing } from '@/theme';

/** min inner width (dp) for 2 columns: 2 × min cell + gutter */
const minInnerForTwoColumns =
  LISTING_CARD_GRID_MIN_CELL_WIDTH_DP * 2 + HOME_FEED_GRID_COLUMN_GAP;

describe('getListingCardGridColumnCount', () => {
  it('allows 2 columns when inner width fits two min cells + gap', () => {
    expect(getListingCardGridColumnCount(minInnerForTwoColumns, 1)).toBe(2);
    expect(getListingCardGridColumnCount(minInnerForTwoColumns + 10, 1)).toBe(2);
  });

  it('falls back to 1 column when inner width is insufficient', () => {
    expect(getListingCardGridColumnCount(minInnerForTwoColumns - 1, 1)).toBe(1);
  });

  it('forces 1 column when font scale exceeds cap', () => {
    expect(
      getListingCardGridColumnCount(minInnerForTwoColumns + 100, HOME_FEED_GRID_MAX_FONT_SCALE + 0.01)
    ).toBe(1);
  });

  it('matches home rule for typical phone widths (screen padding 16)', () => {
    const pad = spacing.screenHorizontal;
    // 360 dp → inner 328 ≥ ~304 → 2 cols at font 1 / 1.3
    expect(
      getListingCardGridColumnCount(getListingCardGridInnerWidth(360, pad), 1)
    ).toBe(2);
    expect(
      getListingCardGridColumnCount(getListingCardGridInnerWidth(360, pad), 1.3)
    ).toBe(2);
    // 320 dp → inner 288 → 1 col
    expect(
      getListingCardGridColumnCount(getListingCardGridInnerWidth(320, pad), 1)
    ).toBe(1);
    // Large text (> cap)
    expect(
      getListingCardGridColumnCount(
        getListingCardGridInnerWidth(430, pad),
        HOME_FEED_GRID_MAX_FONT_SCALE + 0.01
      )
    ).toBe(1);
  });
});

describe('getHomeFeedColumnCount', () => {
  it('returns 1 on narrow logical width (320)', () => {
    expect(getHomeFeedColumnCount(320, 1)).toBe(1);
  });

  it('returns 2 from 360 dp with default font scale', () => {
    expect(getHomeFeedColumnCount(360, 1)).toBe(2);
  });

  it('returns 2 at 375 and 390 with font scale 1 and 1.3', () => {
    expect(getHomeFeedColumnCount(375, 1)).toBe(2);
    expect(getHomeFeedColumnCount(375, 1.3)).toBe(2);
    expect(getHomeFeedColumnCount(390, 1)).toBe(2);
    expect(getHomeFeedColumnCount(390, 1.3)).toBe(2);
  });

  it('returns 1 when system font scale exceeds threshold', () => {
    expect(getHomeFeedColumnCount(430, HOME_FEED_GRID_MAX_FONT_SCALE + 0.01)).toBe(1);
  });
});

describe('getHomeFeedGridCellLayout', () => {
  const inner390 = getHomeFeedGridInnerWidth(390);
  const half = getHomeFeedTwoColumnCellWidth(inner390);

  it('fixes width for a lone cell in a 2-column row', () => {
    const layout = getHomeFeedGridCellLayout(inner390, 2, 1);
    expect(layout.flex).toBe(0);
    expect(layout.width).toBe(half);
    expect(half).toBe((inner390 - HOME_FEED_GRID_COLUMN_GAP) / 2);
  });

  it('uses flex for full rows and single-column mode', () => {
    expect(getHomeFeedGridCellLayout(inner390, 2, 2)).toEqual({ flex: 1, minWidth: 0 });
    expect(getHomeFeedGridCellLayout(inner390, 1, 1)).toEqual({ flex: 1, minWidth: 0 });
  });
});

describe('favorites grid row shapes (1–5 items, 2 columns)', () => {
  const row = (id: string) => ({ id });
  const cellsPerRow = (count: number) =>
    buildHomeFeedGridRows(
      Array.from({ length: count }, (_, i) => row(String(i + 1))),
      2
    ).map((r) => (r.kind === 'cells' ? r.cells.length : 0));

  it('partitions 1..5 listings into [1], [2], [2,1], [2,2], [2,2,1]', () => {
    expect(cellsPerRow(1)).toEqual([1]);
    expect(cellsPerRow(2)).toEqual([2]);
    expect(cellsPerRow(3)).toEqual([2, 1]);
    expect(cellsPerRow(4)).toEqual([2, 2]);
    expect(cellsPerRow(5)).toEqual([2, 2, 1]);
  });
});
