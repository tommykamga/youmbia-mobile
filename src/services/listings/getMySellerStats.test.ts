import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  computeAverageTimeToSaleDays,
  getMySellerStats,
} from './getMySellerStats';
import type { MyListing } from './getMyListings';

const { rpcMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: rpcMock,
  },
}));

type StatsListing = Pick<
  MyListing,
  'status' | 'created_at' | 'sold_at' | 'sale_cycle_started_at'
>;

function listing(overrides: Partial<StatsListing> = {}): StatsListing {
  return {
    status: 'active',
    created_at: '2026-09-01T00:00:00.000Z',
    sold_at: null,
    sale_cycle_started_at: null,
    ...overrides,
  };
}

describe('computeAverageTimeToSaleDays', () => {
  it('returns null when the seller has no listings', () => {
    expect(computeAverageTimeToSaleDays([])).toBeNull();
  });

  it('returns null when there are no valid sold listings', () => {
    expect(
      computeAverageTimeToSaleDays([
        listing({ status: 'active' }),
        listing({ status: 'draft' }),
        listing({ status: 'hidden' }),
      ])
    ).toBeNull();
  });

  it('reuses TOM-99 sale-cycle timestamps to compute the average', () => {
    const result = computeAverageTimeToSaleDays([
      listing({
        status: 'sold',
        created_at: '2026-08-01T00:00:00.000Z',
        sale_cycle_started_at: '2026-09-01T00:00:00.000Z',
        sold_at: '2026-09-03T00:00:00.000Z',
      }),
      listing({
        status: 'sold',
        created_at: '2026-09-01T00:00:00.000Z',
        sale_cycle_started_at: null,
        sold_at: '2026-09-07T00:00:00.000Z',
      }),
    ]);

    expect(result).toBe(4);
  });

  it('ignores invalid, negative and incomplete time-to-sale values', () => {
    const result = computeAverageTimeToSaleDays([
      listing({
        status: 'sold',
        created_at: '2026-09-01T00:00:00.000Z',
        sold_at: '2026-09-03T00:00:00.000Z',
      }),
      listing({
        status: 'sold',
        created_at: 'invalid',
        sold_at: '2026-09-04T00:00:00.000Z',
      }),
      listing({
        status: 'sold',
        created_at: '2026-09-05T00:00:00.000Z',
        sold_at: '2026-09-04T00:00:00.000Z',
      }),
      listing({
        status: 'sold',
        created_at: '2026-09-01T00:00:00.000Z',
        sold_at: null,
      }),
    ]);

    expect(result).toBe(2);
    expect(Number.isFinite(result ?? Number.NaN)).toBe(true);
  });
});

describe('getMySellerStats', () => {
  beforeEach(() => {
    rpcMock.mockReset();
  });

  it('returns zero counters and null average for a seller without listings', async () => {
    rpcMock.mockResolvedValue({
      data: [
        {
          active_listings: 0,
          sold_listings: 0,
          draft_listings: 0,
          paused_listings: 0,
          favorites_received: 0,
          sold_last_30_days: 0,
        },
      ],
      error: null,
    });

    const result = await getMySellerStats([]);

    expect(result).toEqual({
      data: {
        activeListings: 0,
        soldListings: 0,
        draftListings: 0,
        pausedListings: 0,
        favoritesReceived: 0,
        soldLast30Days: 0,
        averageTimeToSaleDays: null,
      },
      error: null,
    });
  });

  it('maps active, sold, draft, paused and favorites correctly', async () => {
    rpcMock.mockResolvedValue({
      data: [
        {
          active_listings: 3,
          sold_listings: 2,
          draft_listings: 1,
          paused_listings: 4,
          favorites_received: 17,
          sold_last_30_days: 2,
        },
      ],
      error: null,
    });

    const result = await getMySellerStats([
      listing({
        status: 'sold',
        created_at: '2026-09-01T00:00:00.000Z',
        sold_at: '2026-09-05T00:00:00.000Z',
      }),
    ]);

    expect(result.data).toEqual({
      activeListings: 3,
      soldListings: 2,
      draftListings: 1,
      pausedListings: 4,
      favoritesReceived: 17,
      soldLast30Days: 2,
      averageTimeToSaleDays: 4,
    });
  });

  it('sanitizes null, negative, fractional and non-finite counters', async () => {
    rpcMock.mockResolvedValue({
      data: [
        {
          active_listings: null,
          sold_listings: -4,
          draft_listings: 2.9,
          paused_listings: Number.NaN,
          favorites_received: Number.POSITIVE_INFINITY,
          sold_last_30_days: '3',
        },
      ],
      error: null,
    });

    const result = await getMySellerStats([]);

    expect(result.data).toEqual({
      activeListings: 0,
      soldListings: 0,
      draftListings: 2,
      pausedListings: 0,
      favoritesReceived: 0,
      soldLast30Days: 3,
      averageTimeToSaleDays: null,
    });
  });

  it('handles an empty RPC result safely', async () => {
    rpcMock.mockResolvedValue({
      data: [],
      error: null,
    });

    const result = await getMySellerStats([]);

    expect(result.data).toEqual({
      activeListings: 0,
      soldListings: 0,
      draftListings: 0,
      pausedListings: 0,
      favoritesReceived: 0,
      soldLast30Days: 0,
      averageTimeToSaleDays: null,
    });
  });

  it('returns a Supabase error without fabricating stats', async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: 'RPC unavailable' },
    });

    const result = await getMySellerStats([]);

    expect(result).toEqual({
      data: null,
      error: { message: 'RPC unavailable' },
    });
  });

  it('uses exactly one RPC call and sends no seller id', async () => {
    rpcMock.mockResolvedValue({
      data: [
        {
          active_listings: 1,
          sold_listings: 0,
          draft_listings: 0,
          paused_listings: 0,
          favorites_received: 5,
          sold_last_30_days: 0,
        },
      ],
      error: null,
    });

    await getMySellerStats([listing()]);

    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith('get_my_seller_stats');
  });
});
