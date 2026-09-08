import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getListingById } from './getListingById';
import { LISTING_UNAVAILABLE_MESSAGE } from '@/lib/listingStatus';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  getSignedUrlsMap: vi.fn(),
  toDisplayImageUrl: vi.fn((url: string) => url),
  getShopSummaryById: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: mocks.getUser },
    from: mocks.from,
  },
}));

vi.mock('@/lib/listingImageUrl', () => ({
  getSignedUrlsMap: mocks.getSignedUrlsMap,
  toDisplayImageUrl: mocks.toDisplayImageUrl,
}));

vi.mock('@/lib/avatarImageUrl', () => ({
  resolveSingleAvatarUrl: vi.fn(),
}));

vi.mock('@/services/profile', () => ({
  getAvatarVersion: vi.fn(() => undefined),
}));

vi.mock('@/services/shops/getShopSummaryById', () => ({
  getShopSummaryById: mocks.getShopSummaryById,
}));

const LISTING_ID = 'listing-1';
const OWNER_ID = 'owner-1';
const OTHER_ID = 'other-1';

function listingRow(status: string, userId = OWNER_ID) {
  return {
    id: LISTING_ID,
    title: 'iPhone',
    price: 1000,
    city: 'Douala',
    description: 'ok',
    boosted: false,
    urgent: false,
    district: null,
    created_at: '2026-01-01T00:00:00.000Z',
    views_count: 2,
    user_id: userId,
    status,
    category_id: 1,
    shop_id: null,
    listing_images: [],
  };
}

function mockListingsThenProfiles(listingData: unknown, listingError: unknown = null) {
  mocks.from.mockImplementation((table: string) => {
    if (table === 'listings') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: listingData, error: listingError }),
          }),
        }),
      };
    }
    if (table === 'profiles') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
      };
    }
    return {
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: null }),
        }),
      }),
    };
  });
}

describe('getListingById sold / owner / public', () => {
  beforeEach(() => {
    mocks.from.mockReset();
    mocks.getUser.mockReset();
    mocks.getSignedUrlsMap.mockReset();
    mocks.getShopSummaryById.mockReset();
    mocks.getSignedUrlsMap.mockResolvedValue(new Map());
    mocks.getShopSummaryById.mockResolvedValue(null);
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
  });

  it('public sold => indisponible', async () => {
    mockListingsThenProfiles(listingRow('sold'));
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });

    const result = await getListingById(LISTING_ID);
    expect(result.data).toBeNull();
    expect(result.error?.message).toBe(LISTING_UNAVAILABLE_MESSAGE);
    expect(mocks.from).toHaveBeenCalledTimes(1);
  });

  it('non-owner sold => indisponible', async () => {
    mockListingsThenProfiles(listingRow('sold'));
    mocks.getUser.mockResolvedValue({ data: { user: { id: OTHER_ID } }, error: null });

    const result = await getListingById(LISTING_ID);
    expect(result.data).toBeNull();
    expect(result.error?.message).toBe(LISTING_UNAVAILABLE_MESSAGE);
    expect(mocks.from).toHaveBeenCalledTimes(1);
  });

  it('owner sold => consultable', async () => {
    mockListingsThenProfiles(listingRow('sold'));
    mocks.getUser.mockResolvedValue({ data: { user: { id: OWNER_ID } }, error: null });

    const result = await getListingById(LISTING_ID);
    expect(result.error).toBeNull();
    expect(result.data?.id).toBe(LISTING_ID);
    expect(result.data?.status).toBe('sold');
    expect(result.data?.seller_id).toBe(OWNER_ID);
  });

  it('owner sold => réactivation disponible (statut exposé)', async () => {
    mockListingsThenProfiles(listingRow('sold'));
    mocks.getUser.mockResolvedValue({ data: { user: { id: OWNER_ID } }, error: null });

    const result = await getListingById(LISTING_ID);
    expect(result.data?.status).toBe('sold');
  });

  it('suspended => indisponible même pour le propriétaire', async () => {
    mockListingsThenProfiles(listingRow('suspended'));
    mocks.getUser.mockResolvedValue({ data: { user: { id: OWNER_ID } }, error: null });

    const result = await getListingById(LISTING_ID);
    expect(result.data).toBeNull();
    expect(result.error?.message).toBe(LISTING_UNAVAILABLE_MESSAGE);
  });

  it('active => inchangé (pas de getUser, listing renvoyée)', async () => {
    mockListingsThenProfiles(listingRow('active'));

    const result = await getListingById(LISTING_ID);
    expect(result.error).toBeNull();
    expect(result.data?.id).toBe(LISTING_ID);
    expect(result.data?.status).toBe('active');
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it('ligne absente (RLS public) => introuvable, pas sold inventé', async () => {
    mockListingsThenProfiles(null);
    const result = await getListingById(LISTING_ID);
    expect(result.data).toBeNull();
    expect(result.error?.message).toBe('Annonce introuvable');
    expect(mocks.getUser).not.toHaveBeenCalled();
  });
});
