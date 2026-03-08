/**
 * Client-side sort for listings. Does not mutate the original array.
 * Used by ListingFeed and Search screen.
 * For sortBy 'recent': boosted listings first (when feature enabled), then by created_at desc.
 */
import type { PublicListing } from '@/services/listings';
import { getDisplayBoosted } from '@/lib/listingSchemaFeatures';

export type SortOption = 'recent' | 'price_asc' | 'price_desc';

export function sortListings(
  listings: PublicListing[] | null | undefined,
  sortBy: SortOption
): PublicListing[] {
  if (!Array.isArray(listings)) return [];
  const sorted = [...listings];
  switch (sortBy) {
    case 'price_asc':
      return sorted.sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
    case 'price_desc':
      return sorted.sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
    case 'recent':
    default:
      return sorted.sort((a, b) => {
        const aBoost = getDisplayBoosted(a) ? 1 : 0;
        const bBoost = getDisplayBoosted(b) ? 1 : 0;
        if (bBoost !== aBoost) return bBoost - aBoost;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
  }
}
