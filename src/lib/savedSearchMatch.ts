/**
 * Contrat de matching « nouvelle annonce ↔ recherche sauvegardée ».
 * Source de vérité runtime = fonction SQL `listing_matches_saved_search`
 * + triggers :
 *   - AFTER INSERT WHEN status = active (TOM-97)
 *   - AFTER UPDATE OF status WHEN draft→active (TOM-98 exception 1re publication)
 * Ledger UNIQUE (saved_search_id, listing_id) : pas de double push.
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

export type ListingLifecycleEvent = 'insert' | 'update' | 'publish_from_draft';

/**
 * Alerte « nouvelle annonce » :
 * - `insert` = INSERT active (TOM-97)
 * - `publish_from_draft` = UPDATE draft→active uniquement (exception TOM-98)
 * Pas d’alerte : INSERT draft, UPDATE draft→draft, active→active, hidden→active,
 * sold→active, renewal, édition quelconque.
 * Un listing encore `draft` n’est jamais éligible (`isListingEligibleForSavedSearchAlert`).
 */
export function shouldDispatchSavedSearchAlertOnEvent(event: ListingLifecycleEvent): boolean {
  return event === 'insert' || event === 'publish_from_draft';
}

/**
 * Matrice événement → matching (miroir SQL TOM-97 + exception TOM-98).
 * Utilisée par les tests pour documenter le contrat sans ambiguïté.
 */
export function shouldMatchSavedSearchOnListingTransition(args: {
  event: 'insert' | 'update';
  oldStatus?: string | null;
  newStatus: string | null | undefined;
}): boolean {
  const next = String(args.newStatus ?? '').toLowerCase();
  if (next !== 'active') return false;
  if (args.event === 'insert') return true;
  const prev = String(args.oldStatus ?? '').toLowerCase();
  return prev === 'draft';
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
