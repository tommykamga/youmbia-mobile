import { computeTimeToSale } from '@/lib/timeToSale';
import { supabase } from '@/lib/supabase';
import type { MyListing } from './getMyListings';

export type SellerEssentialStats = {
  activeListings: number;
  soldListings: number;
  draftListings: number;
  pausedListings: number;
  favoritesReceived: number;
  soldLast30Days: number;
  averageTimeToSaleDays: number | null;
};

type SellerStatsRpcRow = {
  active_listings: number | string | null;
  sold_listings: number | string | null;
  draft_listings: number | string | null;
  paused_listings: number | string | null;
  favorites_received: number | string | null;
  sold_last_30_days: number | string | null;
};

export type GetMySellerStatsResult =
  | { data: SellerEssentialStats; error: null }
  | { data: null; error: { message: string } };

function toNonNegativeInteger(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.floor(parsed);
}

export function computeAverageTimeToSaleDays(
  listings: readonly Pick<
    MyListing,
    'status' | 'created_at' | 'sold_at' | 'sale_cycle_started_at'
  >[]
): number | null {
  const durations = listings
    .filter((listing) => listing.status === 'sold')
    .map((listing) =>
      computeTimeToSale(
        listing.created_at,
        listing.sold_at,
        listing.sale_cycle_started_at
      )
    )
    .filter((duration): duration is NonNullable<typeof duration> => duration != null)
    .map((duration) => duration.days)
    .filter((days) => Number.isFinite(days) && days >= 0);

  if (durations.length === 0) return null;

  const total = durations.reduce((sum, days) => sum + days, 0);
  const average = total / durations.length;

  return Number.isFinite(average) && average >= 0 ? average : null;
}

export async function getMySellerStats(
  listings: readonly Pick<
    MyListing,
    'status' | 'created_at' | 'sold_at' | 'sale_cycle_started_at'
  >[]
): Promise<GetMySellerStatsResult> {
  const { data, error } = await supabase.rpc('get_my_seller_stats');

  if (error) {
    return {
      data: null,
      error: { message: error.message },
    };
  }

  const row = (data?.[0] ?? null) as SellerStatsRpcRow | null;

  if (!row) {
    return {
      data: {
        activeListings: 0,
        soldListings: 0,
        draftListings: 0,
        pausedListings: 0,
        favoritesReceived: 0,
        soldLast30Days: 0,
        averageTimeToSaleDays: computeAverageTimeToSaleDays(listings),
      },
      error: null,
    };
  }

  return {
    data: {
      activeListings: toNonNegativeInteger(row.active_listings),
      soldListings: toNonNegativeInteger(row.sold_listings),
      draftListings: toNonNegativeInteger(row.draft_listings),
      pausedListings: toNonNegativeInteger(row.paused_listings),
      favoritesReceived: toNonNegativeInteger(row.favorites_received),
      soldLast30Days: toNonNegativeInteger(row.sold_last_30_days),
      averageTimeToSaleDays: computeAverageTimeToSaleDays(listings),
    },
    error: null,
  };
}
