/**
 * Local saved-search alerts.
 * Matches recent listings against saved searches with simple, explainable rules.
 */

import type { PublicListing } from '@/services/listings';
import type { SavedSearch } from '@/services/savedSearches';

const CATEGORY_OPTIONS = ['Véhicules', 'Mode', 'Maison', 'Électronique', 'Sport', 'Loisirs', 'Autre'] as const;

export type SavedSearchAlertMatch = {
  listing: PublicListing;
  searchIds: string[];
  searchLabels: string[];
};

function normalizeText(value: string | null | undefined): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function getListingSearchText(listing: PublicListing): string {
  return normalizeText(`${listing.title} ${listing.description ?? ''} ${listing.city}`);
}

function isCategoryQuery(value: string): boolean {
  return CATEGORY_OPTIONS.some((option) => normalizeText(option) === value);
}

function matchesQuery(listing: PublicListing, query: string): boolean {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return true;

  const haystack = getListingSearchText(listing);
  if (haystack.includes(normalizedQuery)) return true;

  const tokens = normalizedQuery
    .split(/\s+/)
    .filter((token) => token.length >= 4);

  if (tokens.length === 0) return false;
  return tokens.every((token) => haystack.includes(token));
}

function matchesCategory(listing: PublicListing, category: string | null): boolean {
  const normalizedCategory = normalizeText(category);
  if (!normalizedCategory) return true;
  return normalizeText(`${listing.title} ${listing.description ?? ''}`).includes(normalizedCategory);
}

function matchesCity(listing: PublicListing, city: string | null): boolean {
  const normalizedCity = normalizeText(city);
  if (!normalizedCity) return true;
  return normalizeText(listing.city) === normalizedCity;
}

function matchesPrice(listing: PublicListing, search: SavedSearch): boolean {
  if (search.priceMin != null && listing.price < search.priceMin) return false;
  if (search.priceMax != null && listing.price > search.priceMax) return false;
  return true;
}

function isNewForSearch(listing: PublicListing, search: SavedSearch): boolean {
  const listingDate = Date.parse(listing.created_at);
  const searchDate = Date.parse(search.createdAt);
  if (!Number.isFinite(listingDate) || !Number.isFinite(searchDate)) return false;
  return listingDate > searchDate;
}

function matchesSavedSearch(listing: PublicListing, search: SavedSearch): boolean {
  const normalizedQuery = normalizeText(search.query);
  const derivedCategory =
    normalizeText(search.category) ?? (isCategoryQuery(normalizedQuery) ? search.query : null);
  if (!matchesPrice(listing, search)) return false;
  if (!matchesCategory(listing, derivedCategory)) return false;
  if (!matchesCity(listing, search.city)) return false;
  if (normalizedQuery && !isCategoryQuery(normalizedQuery) && !matchesQuery(listing, normalizedQuery)) {
    return false;
  }
  if (!isNewForSearch(listing, search)) return false;
  return true;
}

export function getSavedSearchAlertMatches(
  recentListings: PublicListing[],
  savedSearches: SavedSearch[]
): SavedSearchAlertMatch[] {
  const byListingId = new Map<string, SavedSearchAlertMatch>();

  recentListings.forEach((listing) => {
    savedSearches.forEach((search) => {
      if (!matchesSavedSearch(listing, search)) return;

      const existing = byListingId.get(listing.id);
      if (existing) {
        if (!existing.searchIds.includes(search.id)) {
          existing.searchIds.push(search.id);
          existing.searchLabels.push(search.label || search.query);
        }
        return;
      }

      byListingId.set(listing.id, {
        listing,
        searchIds: [search.id],
        searchLabels: [search.label || search.query],
      });
    });
  });

  return Array.from(byListingId.values()).sort((a, b) => {
    if (b.searchIds.length !== a.searchIds.length) {
      return b.searchIds.length - a.searchIds.length;
    }
    return Date.parse(b.listing.created_at) - Date.parse(a.listing.created_at);
  });
}
