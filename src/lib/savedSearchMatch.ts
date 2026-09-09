/**
 * Contrat de matching « nouvelle annonce ↔ recherche sauvegardée ».
 * Source de vérité runtime = fonction SQL `listing_matches_saved_search`
 * (trigger AFTER INSERT). Ce module documente et teste les mêmes règles
 * sans dupliquer Search dans une Edge Function.
 *
 * Réutilise les helpers Search V2 (`searchQuery`) : tokens, ville, prix, branche catégorie.
 */

import type { MarketplaceCategoryIdentity } from '@/lib/marketplaceCategories';
import type { SavedSearchCriteria } from '@/lib/savedSearchCriteria';
import {
  listingMatchesCategoryFilter,
  listingMatchesCityFilter,
  listingMatchesPriceFilter,
  listingMatchesQueryTokens,
  resolveSearchCategoryFilter,
} from '@/services/listings/searchQuery';

export type SavedSearchMatchListing = {
  id: string;
  user_id: string | null;
  status: string;
  title: string;
  city?: string | null;
  description?: string | null;
  category_id?: number | null;
  price: number;
  created_at: string;
};

export type SavedSearchMatchSearch = SavedSearchCriteria & {
  id: string;
  userId: string;
  enabled: boolean;
  createdAt: string;
};

export type ListingLifecycleEvent = 'insert' | 'update';

/**
 * Une alerte « nouvelle annonce » ne part que sur création/publication réelle.
 * Renewal, édition, hidden→active, sold→active : pas d’alerte.
 */
export function shouldDispatchSavedSearchAlertOnEvent(event: ListingLifecycleEvent): boolean {
  return event === 'insert';
}

export function isListingEligibleForSavedSearchAlert(listing: SavedSearchMatchListing): boolean {
  return listing.status === 'active';
}

export function isOwnListingForSavedSearch(
  listing: SavedSearchMatchListing,
  searchUserId: string
): boolean {
  return Boolean(listing.user_id && listing.user_id === searchUserId);
}

export function listingMatchesSavedSearchCriteria(
  listing: SavedSearchMatchListing,
  search: SavedSearchCriteria,
  categories: readonly MarketplaceCategoryIdentity[] = []
): boolean {
  if (search.categoryId != null) {
    const filter = resolveSearchCategoryFilter(categories, search.categoryId);
    if (!listingMatchesCategoryFilter(listing.category_id, filter)) return false;
  }
  if (!listingMatchesCityFilter(listing.city, search.city)) return false;
  if (!listingMatchesPriceFilter(listing.price, search.minPrice, search.maxPrice)) return false;
  if (!listingMatchesQueryTokens(listing, search.query)) return false;
  return true;
}

export function listingMatchesSavedSearch(params: {
  listing: SavedSearchMatchListing;
  search: SavedSearchMatchSearch;
  categories?: readonly MarketplaceCategoryIdentity[];
  event?: ListingLifecycleEvent;
}): boolean {
  const event = params.event ?? 'insert';
  if (!shouldDispatchSavedSearchAlertOnEvent(event)) return false;
  if (!params.search.enabled) return false;
  if (!isListingEligibleForSavedSearchAlert(params.listing)) return false;
  if (isOwnListingForSavedSearch(params.listing, params.search.userId)) return false;
  return listingMatchesSavedSearchCriteria(
    params.listing,
    params.search,
    params.categories ?? []
  );
}

export function savedSearchMatchLedgerKey(savedSearchId: string, listingId: string): string {
  return `${savedSearchId}:${listingId}`;
}
