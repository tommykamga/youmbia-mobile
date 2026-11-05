import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LISTING_STATUS } from '@/lib/listingStatus';
import { countMyActiveListings } from './countMyActiveListings';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: mocks.getUser },
    from: mocks.from,
  },
}));

const USER_ID = '11111111-1111-1111-1111-111111111111';

describe('countMyActiveListings', () => {
  beforeEach(() => {
    mocks.getUser.mockReset();
    mocks.from.mockReset();
  });

  it('returns error when not authenticated', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    const result = await countMyActiveListings();
    expect(result.error?.message).toBe('Non connecté');
  });

  it('counts only active listings for current user', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: USER_ID } },
      error: null,
    });
    const eqStatus = vi.fn().mockResolvedValue({ count: 3, error: null });
    const eqUser = vi.fn(() => ({ eq: eqStatus }));
    mocks.from.mockReturnValue({
      select: () => ({
        eq: eqUser,
      }),
    });

    const result = await countMyActiveListings();
    expect(result.data?.count).toBe(3);
    expect(mocks.from).toHaveBeenCalledWith('listings');
    expect(eqUser).toHaveBeenCalledWith('user_id', USER_ID);
    expect(eqStatus).toHaveBeenCalledWith('status', LISTING_STATUS.active);
  });

  it('propagates supabase errors', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: USER_ID } },
      error: null,
    });
    mocks.from.mockReturnValue({
      select: () => ({
        eq: () => ({
          eq: async () => ({ count: null, error: { message: 'network' } }),
        }),
      }),
    });
    const result = await countMyActiveListings();
    expect(result.error?.message).toBe('network');
  });
});
