import { describe, expect, it } from 'vitest';
import { buildHomeFeedGridRows } from './homeFeedGridRows';
import {
  flatListingIndexById,
  gridRowIndexByListingId,
  pickListingScrollAnchor,
  resolveFlatListScrollIndexForAnchor,
  resolveGridInnerWidthForLayout,
} from './homeFeedGridScrollAnchor';
import { getHomeFeedGridCellLayout, getHomeFeedTwoColumnCellWidth } from '@/lib/responsiveLayout';

const listings = (ids: string[]) => ids.map((id) => ({ id }));

describe('pickListingScrollAnchor', () => {
  it('picks the topmost visible listing in flat mode', () => {
    const flat = listings(['a', 'b', 'c']);
    const anchor = pickListingScrollAnchor([
      { item: flat[2], index: 2, isViewable: true },
      { item: flat[1], index: 1, isViewable: true },
    ]);
    expect(anchor).toEqual({ listingId: 'b', viewPosition: 0 });
  });

  it('reads listing id from a grid row token', () => {
    const rows = buildHomeFeedGridRows(listings(['a', 'b', 'c']), 2);
    const anchor = pickListingScrollAnchor([{ item: rows[1], index: 1, isViewable: true }]);
    expect(anchor?.listingId).toBe('c');
  });
});

describe('column transition scroll index', () => {
  const flat = listings(['l1', 'l2', 'l3', 'l4', 'l5']);
  const rows = buildHomeFeedGridRows(flat, 2);
  const anchor = { listingId: 'l3', viewPosition: 0 };

  it('1 → 2 : same listing id maps to grid row index', () => {
    expect(resolveFlatListScrollIndexForAnchor(anchor, true, flat, rows)).toBe(1);
    expect(gridRowIndexByListingId(rows, 'l3')).toBe(1);
  });

  it('2 → 1 : same listing id maps to flat item index', () => {
    expect(resolveFlatListScrollIndexForAnchor(anchor, false, flat, rows)).toBe(2);
    expect(flatListingIndexById(flat, 'l3')).toBe(2);
  });

  it('does not duplicate anchors when data length changes without column change', () => {
    const more = [...flat, { id: 'l6' }];
    expect(resolveFlatListScrollIndexForAnchor(anchor, false, more, null)).toBe(2);
  });
});

describe('odd grid row width', () => {
  it('uses measured inner width for lone cell (no NaN)', () => {
    const measured = 280;
    const layout = getHomeFeedGridCellLayout(measured, 2, 1);
    const half = getHomeFeedTwoColumnCellWidth(measured);
    expect(Number.isFinite(layout.width)).toBe(true);
    expect(layout.width).toBe(half);
    expect(half).toBe((measured - 8) / 2);
  });

  it('falls back safely when spacing mock would yield NaN', () => {
    expect(resolveGridInnerWidthForLayout(null, Number.NaN)).toBe(0);
    expect(resolveGridInnerWidthForLayout(292, 358)).toBe(292);
  });
});

describe('pagination-shaped search list', () => {
  it('keeps anchor row after appended page (grid)', () => {
    const page1 = listings(['s1', 's2', 's3']);
    const page2 = [...page1, { id: 's4' }, { id: 's5' }];
    const rows = buildHomeFeedGridRows(page2, 2);
    const anchor = { listingId: 's3', viewPosition: 0 };
    expect(resolveFlatListScrollIndexForAnchor(anchor, true, page2, rows)).toBe(1);
    expect(gridRowIndexByListingId(buildHomeFeedGridRows(page1, 2), 's3')).toBe(1);
  });
});
