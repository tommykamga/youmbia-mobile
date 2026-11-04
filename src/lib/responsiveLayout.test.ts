import { describe, expect, it } from 'vitest';
import { buildHomeFeedGridRows } from '@/features/listings/homeFeedGridRows';
import {
  getHomeFeedColumnCount,
  getHomeFeedGridCellLayout,
  getHomeFeedGridInnerWidth,
  getHomeFeedTwoColumnCellWidth,
  HOME_FEED_GRID_COLUMN_GAP,
  HOME_FEED_GRID_MAX_FONT_SCALE,
} from './responsiveLayout';

describe('getHomeFeedColumnCount', () => {
  it('returns 1 on compact logical width', () => {
    expect(getHomeFeedColumnCount(375, 1)).toBe(1);
  });

  it('returns 2 on regular width with default font scale', () => {
    expect(getHomeFeedColumnCount(390, 1)).toBe(2);
    expect(getHomeFeedColumnCount(430, 1)).toBe(2);
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
