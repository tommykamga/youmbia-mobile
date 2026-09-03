import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PROFILE_PROVISIONING_ERROR_MESSAGE } from '@/services/profile/profile';
import { createProShop } from './createProShop';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  ensureProfile: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: mocks.getUser },
    from: mocks.from,
  },
  supabaseRuntime: { isConfigured: true, canPersistSession: true },
}));

vi.mock('@/services/profile', () => ({
  PROFILE_PROVISIONING_ERROR_MESSAGE:
    'Impossible de préparer votre profil vendeur. Réessayez dans quelques instants.',
  ensureProfile: mocks.ensureProfile,
  normalizePhoneForProfile: (raw: string | null | undefined) => {
    if (raw == null || typeof raw !== 'string') return { value: null };
    const trimmed = raw.trim();
    return { value: trimmed || null };
  },
}));

vi.mock('@/lib/shopMediaUrl', () => ({
  resolveShopMediaUrls: vi.fn(async (shop: unknown) => shop),
}));

vi.mock('./uploadShopImage', () => ({
  uploadShopImage: vi.fn(),
}));

const USER_ID = '11111111-1111-1111-1111-111111111111';

const mockShop = {
  id: 'shop-1',
  owner_id: USER_ID,
  name: 'Boutique Test',
  slug: 'boutique-test',
  status: 'active',
  description: null,
  logo_url: null,
  banner_url: null,
  whatsapp_phone: null,
  phone: null,
  city: null,
  is_verified: false,
  is_featured: false,
  created_at: '2026-08-26T00:00:00.000Z',
};

describe('createProShop provisioning', () => {
  let shopInsertPayloads: unknown[];
  let profileUpdates: unknown[];

  beforeEach(() => {
    shopInsertPayloads = [];
    profileUpdates = [];
    mocks.getUser.mockReset();
    mocks.from.mockReset();
    mocks.ensureProfile.mockReset();

    mocks.getUser.mockResolvedValue({
      data: { user: { id: USER_ID, email: 'marina@test.com' } },
      error: null,
    });

    mocks.from.mockImplementation((table: string) => {
      if (table === 'shops') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
          insert: (payload: unknown) => {
            shopInsertPayloads.push(payload);
            return {
              select: () => ({
                single: async () => ({ data: mockShop, error: null }),
              }),
            };
          },
          update: () => ({
            eq: () => ({
              eq: () => ({
                select: () => ({
                  single: async () => ({ data: mockShop, error: null }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'profiles') {
        return {
          update: (payload: unknown) => {
            profileUpdates.push(payload);
            return {
              eq: async () => ({ error: null }),
            };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    });
  });

  it('Boutique Pro avec profil existant → fonctionnement inchangé', async () => {
    mocks.ensureProfile.mockResolvedValue({
      data: {
        id: USER_ID,
        full_name: 'Marina',
        avatar_url: null,
        shop_id: null,
        seller_type: 'individual',
      },
      error: null,
    });

    const result = await createProShop({ name: 'Boutique Test' });

    expect(result.error).toBeNull();
    expect(result.data?.id).toBe('shop-1');
    expect(shopInsertPayloads).toHaveLength(1);
    expect(shopInsertPayloads[0]).toMatchObject({ owner_id: USER_ID, name: 'Boutique Test' });
    expect(profileUpdates).toEqual([{ seller_type: 'pro', shop_id: 'shop-1' }]);
  });

  it('Boutique Pro avec profil absent → ensure puis création boutique', async () => {
    mocks.ensureProfile.mockImplementation(async () => ({
      data: {
        id: USER_ID,
        full_name: null,
        avatar_url: null,
        shop_id: null,
        seller_type: 'individual',
      },
      error: null,
    }));

    const result = await createProShop({ name: 'Atelier Marina' });

    expect(mocks.ensureProfile).toHaveBeenCalledTimes(1);
    expect(result.error).toBeNull();
    expect(shopInsertPayloads).toHaveLength(1);
  });

  it("ensureProfile en échec → pas d'insert shops", async () => {
    mocks.ensureProfile.mockResolvedValue({
      data: null,
      error: { message: PROFILE_PROVISIONING_ERROR_MESSAGE },
    });

    const result = await createProShop({ name: 'Boutique Test' });

    expect(result.data).toBeNull();
    expect(result.error?.message).toBe(PROFILE_PROVISIONING_ERROR_MESSAGE);
    expect(shopInsertPayloads).toHaveLength(0);
    expect(profileUpdates).toHaveLength(0);
  });

  it("existingProfile null n'autorise plus l'insert silencieux", async () => {
    mocks.ensureProfile.mockResolvedValue({
      data: null,
      error: null,
    });

    const result = await createProShop({ name: 'Boutique Test' });

    expect(result.data).toBeNull();
    expect(shopInsertPayloads).toHaveLength(0);
  });

  it('aucune erreur SQL brute affichée (shops_owner_id_fkey)', async () => {
    mocks.ensureProfile.mockResolvedValue({
      data: { id: USER_ID, full_name: null, avatar_url: null, shop_id: null },
      error: null,
    });
    mocks.from.mockImplementation((table: string) => {
      if (table === 'shops') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
          insert: (payload: unknown) => {
            shopInsertPayloads.push(payload);
            return {
              select: () => ({
                single: async () => ({
                  data: null,
                  error: {
                    message:
                      'insert or update on table "shops" violates foreign key constraint "shops_owner_id_fkey"',
                  },
                }),
              }),
            };
          },
        };
      }
      return {};
    });

    const result = await createProShop({ name: 'Boutique Test' });

    expect(result.data).toBeNull();
    expect(result.error?.message).toBe(PROFILE_PROVISIONING_ERROR_MESSAGE);
    expect(result.error?.message.toLowerCase()).not.toContain('shops_owner_id_fkey');
    expect(result.error?.message.toLowerCase()).not.toContain('violates');
    expect(result.error?.message.toLowerCase()).not.toContain('constraint');
  });
});
