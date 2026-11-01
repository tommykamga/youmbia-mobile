import type { PublicListing } from '@/services/listings/getPublicListings';
import { sortListings } from '@/utils/sortListings';

export type DiscoverySortOption = 'discovery' | 'price_asc' | 'price_desc';
export function orderDiscoveryListings(list: PublicListing[], sort: DiscoverySortOption): PublicListing[] {
  return sort === 'discovery' ? list : sortListings(list, sort);
}
