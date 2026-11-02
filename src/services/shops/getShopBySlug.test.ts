import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getShopBySlug } from './getShopBySlug';
import { getShopBySlugAnyStatus } from './getShopBySlugAnyStatus';

const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { from: mocks.from } }));
vi.mock('@/lib/shopMediaUrl', () => ({
  resolveShopMediaUrls: vi.fn(async (shop: unknown) => shop),
}));

const OWNER_ID = '154cb365-a83e-47f7-b9ab-ce33352c7dd0';
const SHOP_ID = 'de9efd15-12ce-4a79-99be-198f50552002';
const SHOP = {
  id: SHOP_ID, owner_id: OWNER_ID, slug: 'w-electronik',
  name: 'W electronik', status: 'active',
};

function mockQueries(responses: Array<{ data: unknown; error: { message: string } | null }>) {
  const queries: Array<{
    filters: Array<[string, unknown]>;
    order: Array<[string, unknown]>;
    limit: number | null;
  }> = [];
  mocks.from.mockImplementation((table: string) => {
    expect(table).toBe('shops');
    const call = { filters: [] as Array<[string, unknown]>, order: [] as Array<[string, unknown]>, limit: null as number | null };
    queries.push(call);
    const chain = {
      eq: (key: string, value: unknown) => { call.filters.push([key, value]); return chain; },
      order: (key: string, opts: unknown) => { call.order.push([key, opts]); return chain; },
      limit: (count: number) => { call.limit = count; return chain; },
      maybeSingle: async () => responses.shift() ?? { data: null, error: null },
    };
    return { select: () => chain };
  });
  return queries;
}

describe('résolution publique boutique legacy /shop/{owner_id}', () => {
  beforeEach(() => { mocks.from.mockReset(); });

  it('ouvre W electronik par owner_id avec filtre active et ordre stable', async () => {
    const queries = mockQueries([
      { data: null, error: null },
      { data: SHOP, error: null },
    ]);
    const response = await getShopBySlug(OWNER_ID);
    expect(response.data).toMatchObject(SHOP);
    expect(queries).toHaveLength(2);
    expect(queries[0].filters).toEqual([['id', OWNER_ID], ['status', 'active']]);
    expect(queries[1].filters).toEqual([['owner_id', OWNER_ID], ['status', 'active']]);
    expect(queries[1].order).toEqual([['created_at', { ascending: true }]]);
    expect(queries[1].limit).toBe(1);
  });

  it('garde le lookup slug ordinaire sans second appel', async () => {
    const queries = mockQueries([{ data: SHOP, error: null }]);
    expect((await getShopBySlug('W-ELECTRONIK')).data).toMatchObject(SHOP);
    expect(queries).toHaveLength(1);
    expect(queries[0].filters).toEqual([['slug', 'w-electronik'], ['status', 'active']]);
  });

  it('priorise id boutique et ne masque pas une erreur SQL par un fallback', async () => {
    const found = mockQueries([{ data: SHOP, error: null }]);
    expect((await getShopBySlug(SHOP_ID)).data).toMatchObject(SHOP);
    expect(found).toHaveLength(1);
    expect(found[0].filters[0]).toEqual(['id', SHOP_ID]);

    const failed = mockQueries([{ data: null, error: { message: 'réseau' } }]);
    const result = await getShopBySlug(OWNER_ID);
    expect(result.data).toBeNull();
    expect(result.error?.message).toBe('réseau');
    expect(failed).toHaveLength(1);
  });

  it('ne retourne pas de boutique absente', async () => {
    const queries = mockQueries([
      { data: null, error: null }, { data: null, error: null },
    ]);
    const result = await getShopBySlug(OWNER_ID);
    expect(result.data).toBeNull();
    expect(queries).toHaveLength(2);
  });

  it('résout l’ancien owner_id dans le fallback propriétaire toutes statuts', async () => {
    const hidden = { ...SHOP, status: 'hidden' };
    const queries = mockQueries([{ data: null, error: null }, { data: hidden, error: null }]);
    expect((await getShopBySlugAnyStatus(OWNER_ID)).data).toMatchObject(hidden);
    expect(queries[1].filters).toEqual([['owner_id', OWNER_ID]]);
  });
});
