import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkListingPublishDailyQuota,
  LISTING_PUBLISH_QUOTA_REACHED_MESSAGE,
  MAX_LISTINGS_PER_24H,
} from './checkListingPublishDailyQuota';
import { LISTING_STATUS } from '@/lib/listingStatus';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: mocks.from,
  },
}));

beforeEach(() => {
  mocks.from.mockReset();
});

function mockCountQuery(count: number | null, error: { message: string } | null = null) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    neq: (column: string, value: unknown) => {
      expect(column).toBe('status');
      expect(value).toBe(LISTING_STATUS.draft);
      return chain;
    },
    gte: () =>
      Promise.resolve({
        count,
        error,
      }),
  };
  mocks.from.mockReturnValue(chain);
  return chain;
}

describe('checkListingPublishDailyQuota', () => {
  it('autorise sous la limite (hors drafts)', async () => {
    mockCountQuery(MAX_LISTINGS_PER_24H - 1);
    const result = await checkListingPublishDailyQuota('user-1');
    expect(result).toEqual({ ok: true, count: MAX_LISTINGS_PER_24H - 1 });
  });

  it('bloque à la limite atteinte', async () => {
    mockCountQuery(MAX_LISTINGS_PER_24H);
    const result = await checkListingPublishDailyQuota('user-1');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toBe(LISTING_PUBLISH_QUOTA_REACHED_MESSAGE);
    expect(result.count).toBe(MAX_LISTINGS_PER_24H);
  });

  it('exclut explicitement status draft du compteur', async () => {
    const chain = mockCountQuery(0);
    const neqSpy = vi.spyOn(chain, 'neq');
    await checkListingPublishDailyQuota('user-1');
    expect(neqSpy).toHaveBeenCalledWith('status', LISTING_STATUS.draft);
  });
});
