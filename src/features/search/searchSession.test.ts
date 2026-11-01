import { describe, expect, it } from 'vitest';
import type { PublicListing } from '@/services/listings';
import { buildSearchPage1SessionKey, getSearchDisplayListings } from './searchSession';

const base = { q: 'iphone', categoryId: null, city: null, min: null, max: null, pageSize: 6 };
describe('search ordering and pagination contracts', () => {
  it('isolates cached first pages by their server sort', () => {
    const keys = (['recent', 'relevance', 'price_asc', 'price_desc'] as const).map(sortBy =>
      buildSearchPage1SessionKey({ ...base, sortBy }));
    expect(new Set(keys).size).toBe(4);
  });

  it('keeps the server order of accumulated recent pages without local sponsored promotion', () => {
    const newer = { id: 'b', created_at: '2026-06-01', boosted: false } as PublicListing;
    const older = { id: 'a', created_at: '2025-01-01', last_published_at: '2026-10-01', boosted: true } as PublicListing;
    expect(getSearchDisplayListings([newer, older], 'recent')).toEqual([newer, older]);
  });

  it('retains existing price comparators', () => {
    const cheap = { id: 'cheap', price: 10 } as PublicListing;
    const expensive = { id: 'expensive', price: 500 } as PublicListing;
    expect(getSearchDisplayListings([expensive, cheap], 'price_asc')).toEqual([cheap, expensive]);
    expect(getSearchDisplayListings([cheap, expensive], 'price_desc')).toEqual([expensive, cheap]);
  });
});
