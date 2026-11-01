import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkListingPublishDailyQuota,
  LISTING_PUBLISH_QUOTA_REACHED_MESSAGE,
  MAX_LISTINGS_PER_24H,
} from './checkListingPublishDailyQuota';

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
    gt: () =>
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

  it('compte le registre de premières publications avec une borne exclusive', async () => {
    const chain = mockCountQuery(0);
    const gtSpy = vi.spyOn(chain, 'gt');
    await checkListingPublishDailyQuota('user-1');
    expect(mocks.from).toHaveBeenCalledWith('listing_first_publications');
    expect(gtSpy).toHaveBeenCalledWith('published_at', expect.any(String));
  });
});
