/**
 * Client-side sort for listings. Does not mutate the original array.
 * Used by ListingFeed (Home) and Search.
 *
 * - recent: boosted first (si flag), puis created_at desc. Jamais de pertinence.
 * - relevance: score décroissant, puis created_at desc (tie-breaker). Search uniquement.
 * - price_asc / price_desc: inchangés.
 */
import type { PublicListing } from '@/services/listings';
import { getDisplayBoosted } from '@/lib/listingSchemaFeatures';
import type { MarketplaceCategoryIdentity } from '@/lib/marketplaceCategories';
import { compareSearchRelevance } from '@/services/listings/searchQuery';

export type SortOption = 'recent' | 'relevance' | 'price_asc' | 'price_desc';

export type SortListingsContext = {
  query?: string | null;
  categories?: readonly MarketplaceCategoryIdentity[];
};

function sortByRecent(listings: PublicListing[]): PublicListing[] {
  return [...listings].sort((a, b) => {
    const aBoost = getDisplayBoosted(a) ? 1 : 0;
    const bBoost = getDisplayBoosted(b) ? 1 : 0;
    if (bBoost !== aBoost) return bBoost - aBoost;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

export function sortListings(
  listings: PublicListing[] | null | undefined,
  sortBy: SortOption,
  context?: SortListingsContext
): PublicListing[] {
  if (!Array.isArray(listings)) return [];
  const sorted = [...listings];
  switch (sortBy) {
    case 'price_asc':
      return sorted.sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
    case 'price_desc':
      return sorted.sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
    case 'relevance': {
      const query = context?.query?.trim() ?? '';
      if (!query) {
        return sortByRecent(sorted);
      }
      const categories = context?.categories ?? [];
      return sorted.sort((a, b) => compareSearchRelevance(a, b, query, categories));
    }
    case 'recent':
    default:
      return sortByRecent(sorted);
  }
}
