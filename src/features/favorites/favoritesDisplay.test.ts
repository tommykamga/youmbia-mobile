import { describe, expect, it } from 'vitest';
import { deriveFavoritesDisplay } from './favoritesDisplay';
import type { PublicListing } from '@/services/listings';

const listing = (id: string): PublicListing =>
  ({
    id,
    title: `Annonce ${id}`,
    price: 1000,
    city: 'Douala',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    images: [],
    views_count: 0,
    seller_id: 'seller',
  }) as PublicListing;

describe('deriveFavoritesDisplay', () => {
  it('returns empty_none when no favorites are registered', () => {
    const model = deriveFavoritesDisplay([listing('a')], new Set());
    expect(model.mode).toBe('empty_none');
    expect(model.headerCount).toBe(0);
    expect(model.visibleListings).toEqual([]);
  });

  it('lists active favorites and counts header from visible cards', () => {
    const pool = [listing('a'), listing('b'), listing('c')];
    const model = deriveFavoritesDisplay(pool, new Set(['a', 'c']));
    expect(model.mode).toBe('list');
    expect(model.headerCount).toBe(2);
    expect(model.visibleListings.map((x) => x.id)).toEqual(['a', 'c']);
  });

  it('reflects optimistic removal without mutating the pool', () => {
    const pool = [listing('a'), listing('b')];
    const model = deriveFavoritesDisplay(pool, new Set(['b']));
    expect(model.visibleListings.map((x) => x.id)).toEqual(['b']);
  });

  it('distinguishes registered favorites with no active listing (unavailable)', () => {
    const model = deriveFavoritesDisplay([], new Set(['sold-1', 'sold-2']));
    expect(model.mode).toBe('empty_unavailable');
    expect(model.registeredCount).toBe(2);
    expect(model.unavailableCount).toBe(2);
    expect(model.headerCount).toBe(0);
  });

  it('keeps unavailable favorites when some active listings remain', () => {
    const model = deriveFavoritesDisplay([listing('active')], new Set(['active', 'gone']));
    expect(model.mode).toBe('list');
    expect(model.headerCount).toBe(1);
    expect(model.unavailableCount).toBe(1);
  });

  it('updates header count when last visible favorite is removed optimistically', () => {
    const pool = [listing('a')];
    const before = deriveFavoritesDisplay(pool, new Set(['a']));
    const after = deriveFavoritesDisplay(pool, new Set());
    expect(before.headerCount).toBe(1);
    expect(before.mode).toBe('list');
    expect(after.mode).toBe('empty_none');
    expect(after.headerCount).toBe(0);
  });
});
