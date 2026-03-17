import { LISTING_CATEGORIES } from '@/lib/listingCategories';
import { supabase } from '@/lib/supabase';
import type { Tables } from '@/types/database';

type ActiveListingRow = Pick<
  Tables<'listings'>,
  'id' | 'user_id' | 'category_id' | 'city' | 'views_count' | 'contact_clicks_count'
>;

type FavoriteRow = Pick<Tables<'favorites'>, 'listing_id'>;
type CategoryRow = Pick<Tables<'categories'>, 'id' | 'name' | 'slug'>;
type ProfileRow = Pick<Tables<'profiles'>, 'id' | 'full_name'>;

export type MarketplaceVolumeMetrics = {
  activeListings: number;
  activeSellers: number;
  averageListingsPerSeller: number;
};

export type ListingPerformanceMetric = {
  listingId: string;
  sellerId: string | null;
  categoryId: number | null;
  city: string | null;
  views: number;
  favorites: number;
  contacts: number;
};

export type ListingPerformanceMetrics = {
  averages: {
    viewsPerListing: number;
    favoritesPerListing: number;
    contactsPerListing: number;
  };
  byListing: ListingPerformanceMetric[];
};

export type SellerActivityMetric = {
  sellerId: string;
  fullName: string | null;
  activeListingCount: number;
};

export type SellerEngagementMetrics = {
  publishedListingsBySeller: Array<{ sellerId: string; activeListingCount: number }>;
  topSellers: SellerActivityMetric[];
  singleListingSellerSharePct: number;
  multiListingSellerSharePct: number;
};

export type StockQualityMetrics = {
  listingsWithoutViewsSharePct: number;
  listingsWithoutFavoritesSharePct: number;
  listingsWithoutContactsSharePct: number;
};

export type ActivityBucket = {
  id: string;
  label: string;
  count: number;
};

export type BusinessReadMetrics = {
  topCategories: ActivityBucket[];
  topCities: ActivityBucket[];
};

export type MarketplaceAnalyticsSnapshot = {
  generatedAt: string;
  partial: boolean;
  warnings: string[];
  marketplaceVolume: MarketplaceVolumeMetrics;
  listingPerformance: ListingPerformanceMetrics;
  sellerEngagement: SellerEngagementMetrics;
  stockQuality: StockQualityMetrics;
  businessRead: BusinessReadMetrics;
};

export type GetMarketplaceAnalyticsResult = {
  data: MarketplaceAnalyticsSnapshot;
  error: null | { message: string };
};

const DEFAULT_WARNING = "Certaines métriques n'ont pas pu être calculées.";
const TOP_SELLERS_LIMIT = 10;
const TOP_BUCKETS_LIMIT = 10;

function roundMetric(value: number, digits: number = 2): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function safeCount(value: unknown): number {
  return Math.max(0, Number(value ?? 0) || 0);
}

function toSharePct(count: number, total: number): number {
  if (total <= 0) return 0;
  return roundMetric((count / total) * 100, 2);
}

function buildDefaultSnapshot(): MarketplaceAnalyticsSnapshot {
  return {
    generatedAt: new Date().toISOString(),
    partial: false,
    warnings: [],
    marketplaceVolume: {
      activeListings: 0,
      activeSellers: 0,
      averageListingsPerSeller: 0,
    },
    listingPerformance: {
      averages: {
        viewsPerListing: 0,
        favoritesPerListing: 0,
        contactsPerListing: 0,
      },
      byListing: [],
    },
    sellerEngagement: {
      publishedListingsBySeller: [],
      topSellers: [],
      singleListingSellerSharePct: 0,
      multiListingSellerSharePct: 0,
    },
    stockQuality: {
      listingsWithoutViewsSharePct: 0,
      listingsWithoutFavoritesSharePct: 0,
      listingsWithoutContactsSharePct: 0,
    },
    businessRead: {
      topCategories: [],
      topCities: [],
    },
  };
}

function pushWarning(snapshot: MarketplaceAnalyticsSnapshot, warning: string): void {
  if (!warning.trim()) return;
  snapshot.partial = true;
  if (!snapshot.warnings.includes(warning)) {
    snapshot.warnings.push(warning);
  }
}

function sortBucketsDescending<T extends { count: number; label: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.label.localeCompare(b.label, 'fr');
  });
}

export async function getMarketplaceAnalytics(): Promise<GetMarketplaceAnalyticsResult> {
  const snapshot = buildDefaultSnapshot();

  try {
    const { data: listingRows, error: listingsError } = await supabase
      .from('listings')
      .select('id, user_id, category_id, city, views_count, contact_clicks_count')
      .eq('status', 'active');

    if (listingsError) {
      return {
        data: snapshot,
        error: { message: 'Impossible de charger les métriques marketplace' },
      };
    }

    const listings = (listingRows ?? []) as ActiveListingRow[];
    const listingIds = listings.map((listing) => listing.id);
    const sellerCountMap = new Map<string, number>();
    const categoryCountMap = new Map<number | null, number>();
    const cityCountMap = new Map<string, number>();

    listings.forEach((listing) => {
      const sellerId = listing.user_id?.trim();
      if (sellerId) {
        sellerCountMap.set(sellerId, (sellerCountMap.get(sellerId) ?? 0) + 1);
      }

      categoryCountMap.set(
        listing.category_id ?? null,
        (categoryCountMap.get(listing.category_id ?? null) ?? 0) + 1
      );

      const city = listing.city?.trim();
      if (city) {
        cityCountMap.set(city, (cityCountMap.get(city) ?? 0) + 1);
      }
    });

    const activeListings = listings.length;
    const activeSellers = sellerCountMap.size;
    snapshot.marketplaceVolume = {
      activeListings,
      activeSellers,
      averageListingsPerSeller:
        activeSellers > 0 ? roundMetric(activeListings / activeSellers) : 0,
    };

    const fallbackCategoryMap = new Map<number, string>(
      LISTING_CATEGORIES.map((category) => [category.id, category.label])
    );

    const favoriteCountMap = new Map<string, number>();
    if (listingIds.length > 0) {
      const { data: favoriteRows, error: favoritesError } = await supabase
        .from('favorites')
        .select('listing_id')
        .in('listing_id', listingIds);

      if (favoritesError) {
        pushWarning(snapshot, DEFAULT_WARNING);
      } else {
        (favoriteRows ?? []).forEach((favorite) => {
          const listingId = (favorite as FavoriteRow).listing_id;
          if (!listingId) return;
          favoriteCountMap.set(listingId, (favoriteCountMap.get(listingId) ?? 0) + 1);
        });
      }
    }

    const byListing = listings.map<ListingPerformanceMetric>((listing) => ({
      listingId: listing.id,
      sellerId: listing.user_id ?? null,
      categoryId: listing.category_id ?? null,
      city: listing.city?.trim() || null,
      views: safeCount(listing.views_count),
      favorites: safeCount(favoriteCountMap.get(listing.id)),
      contacts: safeCount(listing.contact_clicks_count),
    }));

    const totalViews = byListing.reduce((sum, item) => sum + item.views, 0);
    const totalFavorites = byListing.reduce((sum, item) => sum + item.favorites, 0);
    const totalContacts = byListing.reduce((sum, item) => sum + item.contacts, 0);

    snapshot.listingPerformance = {
      averages: {
        viewsPerListing: activeListings > 0 ? roundMetric(totalViews / activeListings) : 0,
        favoritesPerListing: activeListings > 0 ? roundMetric(totalFavorites / activeListings) : 0,
        contactsPerListing: activeListings > 0 ? roundMetric(totalContacts / activeListings) : 0,
      },
      byListing,
    };

    const singleListingSellers = Array.from(sellerCountMap.values()).filter((count) => count === 1).length;
    const multiListingSellers = Array.from(sellerCountMap.values()).filter((count) => count > 1).length;

    const topSellerCounts = Array.from(sellerCountMap.entries())
      .map(([sellerId, activeListingCount]) => ({ sellerId, activeListingCount }))
      .sort((a, b) => b.activeListingCount - a.activeListingCount)
      .slice(0, TOP_SELLERS_LIMIT);

    let topSellerProfiles = new Map<string, string | null>();
    if (topSellerCounts.length > 0) {
      const { data: profileRows, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in(
          'id',
          topSellerCounts.map((item) => item.sellerId)
        );

      if (profilesError) {
        pushWarning(snapshot, DEFAULT_WARNING);
      } else {
        topSellerProfiles = new Map(
          ((profileRows ?? []) as ProfileRow[]).map((profile) => [
            profile.id,
            profile.full_name?.trim() || null,
          ])
        );
      }
    }

    snapshot.sellerEngagement = {
      publishedListingsBySeller: sortBucketsDescending(
        Array.from(sellerCountMap.entries()).map(([sellerId, count]) => ({
          sellerId,
          activeListingCount: count,
          count,
          label: sellerId,
        }))
      ).map(({ sellerId, activeListingCount }) => ({ sellerId, activeListingCount })),
      topSellers: topSellerCounts.map((item) => ({
        sellerId: item.sellerId,
        fullName: topSellerProfiles.get(item.sellerId) ?? null,
        activeListingCount: item.activeListingCount,
      })),
      singleListingSellerSharePct: toSharePct(singleListingSellers, activeSellers),
      multiListingSellerSharePct: toSharePct(multiListingSellers, activeSellers),
    };

    snapshot.stockQuality = {
      listingsWithoutViewsSharePct: toSharePct(
        byListing.filter((listing) => listing.views === 0).length,
        activeListings
      ),
      listingsWithoutFavoritesSharePct: toSharePct(
        byListing.filter((listing) => listing.favorites === 0).length,
        activeListings
      ),
      listingsWithoutContactsSharePct: toSharePct(
        byListing.filter((listing) => listing.contacts === 0).length,
        activeListings
      ),
    };

    const uniqueCategoryIds = Array.from(categoryCountMap.keys()).filter(
      (categoryId): categoryId is number => categoryId != null
    );
    const categoryNameMap = new Map<number, string>();

    if (uniqueCategoryIds.length > 0) {
      const { data: categoryRows, error: categoriesError } = await supabase
        .from('categories')
        .select('id, name, slug')
        .in('id', uniqueCategoryIds);

      if (categoriesError) {
        pushWarning(snapshot, DEFAULT_WARNING);
      } else {
        ((categoryRows ?? []) as CategoryRow[]).forEach((category) => {
          categoryNameMap.set(category.id, category.name?.trim() || category.slug?.trim() || `#${category.id}`);
        });
      }
    }

    const topCategories = sortBucketsDescending(
      Array.from(categoryCountMap.entries()).map(([categoryId, count]) => ({
        id: categoryId != null ? String(categoryId) : 'uncategorized',
        label:
          categoryId != null
            ? categoryNameMap.get(categoryId) ?? fallbackCategoryMap.get(categoryId) ?? `Catégorie #${categoryId}`
            : 'Non catégorisée',
        count,
      }))
    ).slice(0, TOP_BUCKETS_LIMIT);

    const topCities = sortBucketsDescending(
      Array.from(cityCountMap.entries()).map(([city, count]) => ({
        id: city,
        label: city,
        count,
      }))
    ).slice(0, TOP_BUCKETS_LIMIT);

    snapshot.businessRead = {
      topCategories,
      topCities,
    };

    snapshot.generatedAt = new Date().toISOString();
    return { data: snapshot, error: null };
  } catch {
    return {
      data: snapshot,
      error: { message: 'Impossible de charger les métriques marketplace' },
    };
  }
}
