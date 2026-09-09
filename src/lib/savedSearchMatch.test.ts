import { describe, expect, it } from 'vitest';
import type { MarketplaceCategoryIdentity } from '@/lib/marketplaceCategories';
import {
  listingMatchesSavedSearch,
  shouldDispatchSavedSearchAlertOnEvent,
  shouldMatchSavedSearchOnListingTransition,
  type SavedSearchMatchListing,
  type SavedSearchMatchSearch,
} from './savedSearchMatch';

const TAXONOMY: MarketplaceCategoryIdentity[] = [
  { id: 5, name: 'Véhicules', slug: 'vehicules', parent_id: null },
  { id: 6, name: 'Voitures', slug: 'voitures', parent_id: 5 },
  { id: 8, name: 'Berlines', slug: 'berlines', parent_id: 6 },
  { id: 19, name: 'Électronique', slug: 'electronique', parent_id: null },
  { id: 20, name: 'Téléphones', slug: 'telephones-objets-connectes', parent_id: 19 },
];

function listing(partial: Partial<SavedSearchMatchListing> & Pick<SavedSearchMatchListing, 'title'>): SavedSearchMatchListing {
  return {
    id: partial.id ?? 'listing-1',
    user_id: partial.user_id ?? 'seller-1',
    status: partial.status ?? 'active',
    title: partial.title,
    city: partial.city ?? 'Douala',
    description: partial.description ?? '',
    category_id: partial.category_id ?? 20,
    price: partial.price ?? 150000,
    created_at: partial.created_at ?? '2026-09-08T11:50:00.000Z',
  };
}

function search(partial: Partial<SavedSearchMatchSearch> = {}): SavedSearchMatchSearch {
  return {
    id: partial.id ?? 'search-1',
    userId: partial.userId ?? 'buyer-1',
    enabled: partial.enabled ?? true,
    createdAt: partial.createdAt ?? '2026-09-01T00:00:00.000Z',
    query: partial.query ?? 'iphone',
    categoryId: partial.categoryId ?? 19,
    city: partial.city ?? 'Douala',
    minPrice: partial.minPrice ?? 100000,
    maxPrice: partial.maxPrice ?? 200000,
  };
}

describe('savedSearchMatch', () => {
  it('sold / renewal / update : aucun nouveau match ; draft non éligible ; publish_from_draft OK', () => {
    expect(shouldDispatchSavedSearchAlertOnEvent('update')).toBe(false);
    expect(shouldDispatchSavedSearchAlertOnEvent('insert')).toBe(true);
    expect(shouldDispatchSavedSearchAlertOnEvent('publish_from_draft')).toBe(true);
    expect(
      listingMatchesSavedSearch({
        listing: listing({ title: 'iPhone 13', status: 'sold' }),
        search: search(),
        categories: TAXONOMY,
      })
    ).toBe(false);
    expect(
      listingMatchesSavedSearch({
        listing: listing({ title: 'iPhone 13', status: 'draft' }),
        search: search(),
        categories: TAXONOMY,
        event: 'insert',
      })
    ).toBe(false);
    expect(
      listingMatchesSavedSearch({
        listing: listing({ title: 'iPhone 13', status: 'active' }),
        search: search(),
        categories: TAXONOMY,
        event: 'publish_from_draft',
      })
    ).toBe(true);
  });

  it('matrice transitions SQL : seule 1re publication draft→active matche en UPDATE', () => {
    expect(shouldMatchSavedSearchOnListingTransition({ event: 'insert', newStatus: 'active' })).toBe(
      true
    );
    expect(shouldMatchSavedSearchOnListingTransition({ event: 'insert', newStatus: 'draft' })).toBe(
      false
    );
    expect(
      shouldMatchSavedSearchOnListingTransition({
        event: 'update',
        oldStatus: 'draft',
        newStatus: 'active',
      })
    ).toBe(true);
    expect(
      shouldMatchSavedSearchOnListingTransition({
        event: 'update',
        oldStatus: 'hidden',
        newStatus: 'active',
      })
    ).toBe(false);
    expect(
      shouldMatchSavedSearchOnListingTransition({
        event: 'update',
        oldStatus: 'sold',
        newStatus: 'active',
      })
    ).toBe(false);
    expect(
      shouldMatchSavedSearchOnListingTransition({
        event: 'update',
        oldStatus: 'active',
        newStatus: 'active',
      })
    ).toBe(false);
  });

  it('matche query + catégorie racine (branche) + ville + prix', () => {
    expect(
      listingMatchesSavedSearch({
        listing: listing({ title: 'iPhone 13', city: 'Douala', category_id: 20, price: 150000 }),
        search: search(),
        categories: TAXONOMY,
      })
    ).toBe(true);
  });

  it('refuse une catégorie hors branche', () => {
    expect(
      listingMatchesSavedSearch({
        listing: listing({ title: 'iPhone 13', category_id: 8 }),
        search: search(),
        categories: TAXONOMY,
      })
    ).toBe(false);
  });

  it('refuse une ville ou un prix hors critères', () => {
    expect(
      listingMatchesSavedSearch({
        listing: listing({ title: 'iPhone 13', city: 'Yaoundé' }),
        search: search(),
        categories: TAXONOMY,
      })
    ).toBe(false);
    expect(
      listingMatchesSavedSearch({
        listing: listing({ title: 'iPhone 13', price: 50000 }),
        search: search(),
        categories: TAXONOMY,
      })
    ).toBe(false);
  });

  it('refuse une query qui ne matche pas les tokens Search', () => {
    expect(
      listingMatchesSavedSearch({
        listing: listing({ title: 'Samsung Galaxy', city: 'Douala' }),
        search: search({ query: 'iphone douala' }),
        categories: TAXONOMY,
      })
    ).toBe(false);
  });

  it('n’alerte pas une annonce inactive ou du propriétaire ; INSERT reste éligible même si created_at est ancien', () => {
    const base = {
      search: search(),
      categories: TAXONOMY,
    };
    expect(
      listingMatchesSavedSearch({
        ...base,
        listing: listing({ title: 'iPhone 13', status: 'hidden' }),
      })
    ).toBe(false);
    expect(
      listingMatchesSavedSearch({
        ...base,
        listing: listing({ title: 'iPhone 13', status: 'sold' }),
      })
    ).toBe(false);
    expect(
      listingMatchesSavedSearch({
        ...base,
        listing: listing({
          title: 'iPhone 13',
          created_at: '2026-08-01T00:00:00.000Z',
        }),
      })
    ).toBe(true);
    expect(
      listingMatchesSavedSearch({
        ...base,
        listing: listing({ title: 'iPhone 13', user_id: 'buyer-1' }),
      })
    ).toBe(false);
  });

  it('n’alerte pas si la recherche est désactivée', () => {
    expect(
      listingMatchesSavedSearch({
        listing: listing({ title: 'iPhone 13' }),
        search: search({ enabled: false }),
        categories: TAXONOMY,
      })
    ).toBe(false);
  });
});
