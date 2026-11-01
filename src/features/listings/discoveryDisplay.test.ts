import { expect, it } from 'vitest';
import type { PublicListing } from '@/services/listings/getPublicListings';
import { orderDiscoveryListings } from './discoveryDisplay';
it('retains seller diversification and page order despite newer or boosted rows', () => {
  const a = {id:'a',created_at:'2025-01-01',boosted:false} as PublicListing;
  const b = {id:'b',created_at:'2026-01-01',boosted:true} as PublicListing;
  expect(orderDiscoveryListings([a,b], 'discovery')).toEqual([a,b]);
});
it('retains price sorting', () => {
  const a = {id:'a',price:100} as PublicListing;
  const b = {id:'b',price:10} as PublicListing;
  expect(orderDiscoveryListings([a,b], 'price_asc')).toEqual([b,a]);
  expect(orderDiscoveryListings([b,a], 'price_desc')).toEqual([a,b]);
});
