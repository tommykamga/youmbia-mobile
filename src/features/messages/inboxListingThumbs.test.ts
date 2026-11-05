import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { PublicListing } from '@/services/listings/getPublicListings';
import {
  listingIdsCacheKey,
  loadInboxListingThumbsForIds,
  mapListingsToThumbById,
  thumbMapsEqual,
  uniqueListingIdsFromConversations,
} from './inboxListingThumbs';

const getListingsByIds = vi.fn();

vi.mock('@/services/listings/getListingsByIds', () => ({
  getListingsByIds: (...args: unknown[]) => getListingsByIds(...args),
}));

function listing(partial: Partial<PublicListing> & { id: string }): PublicListing {
  return {
    title: 't',
    price: 0,
    city: 'Douala',
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    images: [],
    views_count: 0,
    seller_id: 's',
    ...partial,
  };
}

describe('inboxListingThumbs helpers', () => {
  it('deduplicates listing ids', () => {
    const ids = uniqueListingIdsFromConversations([
      { listing_id: 'b' },
      { listing_id: 'a' },
      { listing_id: 'b' },
    ]);
    expect(ids).toEqual(['a', 'b']);
  });

  it('maps first card image only', () => {
    const map = mapListingsToThumbById([
      listing({ id: 'l1', images: ['https://cdn/a.jpg'] }),
      listing({ id: 'l2', images: [] }),
    ]);
    expect(map).toEqual({ l1: 'https://cdn/a.jpg' });
  });

  it('stable cache key', () => {
    expect(listingIdsCacheKey(['a', 'b'])).toBe(listingIdsCacheKey(['a', 'b']));
    expect(thumbMapsEqual({ a: '1' }, { a: '1' })).toBe(true);
  });
});

describe('loadInboxListingThumbsForIds', () => {
  beforeEach(() => {
    getListingsByIds.mockReset();
  });

  it('une requête getListingsByIds pour N conversations même annonce', async () => {
    getListingsByIds.mockResolvedValue({
      data: [{ id: 'l1', images: ['https://thumb.jpg'] }],
      error: null,
    });
    const ids = uniqueListingIdsFromConversations([
      { listing_id: 'l1' },
      { listing_id: 'l1' },
    ]);
    const map = await loadInboxListingThumbsForIds(ids);
    expect(getListingsByIds).toHaveBeenCalledTimes(1);
    expect(getListingsByIds.mock.calls[0][0]).toEqual(['l1']);
    expect(map.l1).toBe('https://thumb.jpg');
  });

  it('retourne {} si getListingsByIds échoue', async () => {
    getListingsByIds.mockResolvedValue({ data: null, error: { message: 'x' } });
    const map = await loadInboxListingThumbsForIds(['l1']);
    expect(map).toEqual({});
  });

  it('ignore annonces actives sans image', async () => {
    getListingsByIds.mockResolvedValue({
      data: [{ id: 'l1', images: [] }],
      error: null,
    });
    const map = await loadInboxListingThumbsForIds(['l1']);
    expect(map).toEqual({});
  });
});

describe('mapListingsToThumbById — annonce inactive absente du batch', () => {
  it('ne fabrique pas d’URL pour listing manquant', () => {
    expect(mapListingsToThumbById([])).toEqual({});
  });
});
