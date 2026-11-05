import { describe, expect, it } from 'vitest';
import { buildHomeFeedGridRows } from './homeFeedGridRows';
import type { PublicListing } from '@/services/listings';

const row = (id: string): PublicListing =>
  ({
    id,
    title: id,
    price: 1,
    city: 'Douala',
    images: [],
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    views_count: 0,
    seller_id: 'seller',
  }) as PublicListing;

describe('buildHomeFeedGridRows', () => {
  it('builds two-column rows for favorites/home grids', () => {
    const rows = buildHomeFeedGridRows([row('1'), row('2'), row('3')], 2);
    expect(rows).toHaveLength(2);
    expect(rows[0].kind).toBe('cells');
    if (rows[0].kind === 'cells') {
      expect(rows[0].cells.map((c) => (c as PublicListing).id)).toEqual(['1', '2']);
    }
    if (rows[1].kind === 'cells') {
      expect(rows[1].cells.map((c) => (c as PublicListing).id)).toEqual(['3']);
    }
  });

  it('builds single-column rows when accessibility font scale forces one column', () => {
    const rows = buildHomeFeedGridRows([row('1'), row('2')], 1);
    expect(rows).toHaveLength(2);
    if (rows[0].kind === 'cells') expect((rows[0].cells[0] as PublicListing).id).toBe('1');
    if (rows[1].kind === 'cells') expect((rows[1].cells[0] as PublicListing).id).toBe('2');
  });
});
