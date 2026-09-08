import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { markListingSold, updateListingStatus } from './updateListingStatus';
import { LISTING_STATUS } from '@/lib/listingStatus';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  trackListingMarkedSold: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: mocks.getUser },
    from: mocks.from,
  },
}));

vi.mock('@/lib/analytics', () => ({
  trackListingMarkedSold: mocks.trackListingMarkedSold,
}));

const USER_ID = '11111111-1111-1111-1111-111111111111';
const OTHER_ID = '22222222-2222-2222-2222-222222222222';
const LISTING_ID = '33333333-3333-3333-3333-333333333333';
const MIGRATION_PATH = resolve(
  process.cwd(),
  'supabase/migrations/20260908220000_listing_status_sold_v1.sql'
);

function authUser(id = USER_ID) {
  return { id };
}

type UpdateCapture = {
  table: string | null;
  payload: Record<string, unknown> | null;
  filters: { column: string; value: unknown }[];
  deleteCalled: boolean;
};

function createListingsClient(options: {
  selectData?: { id: string; status: string } | null;
  selectError?: { message: string } | null;
  updateData?: { id: string; status: string } | null;
  updateError?: { message: string } | null;
  capture: UpdateCapture;
}) {
  return {
    select: (columns: string) => {
      expect(columns).toContain('status');
      const chain = {
        eq: (column: string, value: unknown) => {
          options.capture.filters.push({ column, value });
          return chain;
        },
        maybeSingle: async () => ({
          data: options.selectData ?? null,
          error: options.selectError ?? null,
        }),
      };
      return chain;
    },
    update: (payload: Record<string, unknown>) => {
      options.capture.payload = payload;
      const chain = {
        eq: (column: string, value: unknown) => {
          options.capture.filters.push({ column, value });
          return chain;
        },
        select: () => chain,
        maybeSingle: async () => ({
          data: options.updateData ?? null,
          error: options.updateError ?? null,
        }),
      };
      return chain;
    },
    delete: () => {
      options.capture.deleteCalled = true;
      return {
        eq: () => ({
          eq: async () => ({ error: null }),
        }),
      };
    },
  };
}

describe('listing_status sold migration contract', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');

  it('ajoute sold de façon additive sans DELETE ni rewrite', () => {
    expect(sql).toMatch(/ALTER TYPE public\.listing_status ADD VALUE IF NOT EXISTS 'sold'/);
    expect(sql).not.toMatch(/DELETE FROM public\.listings/i);
    expect(sql).not.toMatch(/UPDATE public\.listings/i);
    expect(sql).toMatch(/Ne pas appliquer cette migration sans validation/);
  });
});

describe('updateListingStatus / markListingSold', () => {
  let capture: UpdateCapture;

  beforeEach(() => {
    capture = { table: null, payload: null, filters: [], deleteCalled: false };
    mocks.getUser.mockReset();
    mocks.from.mockReset();
    mocks.trackListingMarkedSold.mockReset();
    mocks.getUser.mockResolvedValue({ data: { user: authUser() }, error: null });
  });

  it('permet au propriétaire de marquer une annonce active comme vendue', async () => {
    mocks.from.mockImplementation((table: string) => {
      capture.table = table;
      return createListingsClient({
        selectData: { id: LISTING_ID, status: 'active' },
        updateData: { id: LISTING_ID, status: 'sold' },
        capture,
      });
    });

    const result = await markListingSold(LISTING_ID);

    expect(result.error).toBeNull();
    expect(result.data).toEqual({ id: LISTING_ID, status: LISTING_STATUS.sold });
    expect(capture.table).toBe('listings');
    expect(capture.payload).toEqual({ status: 'sold' });
    expect(capture.filters).toEqual(
      expect.arrayContaining([
        { column: 'id', value: LISTING_ID },
        { column: 'user_id', value: USER_ID },
      ])
    );
    expect(capture.deleteCalled).toBe(false);
    expect(mocks.trackListingMarkedSold).toHaveBeenCalledWith({ listing_id: LISTING_ID });
  });

  it('refuse un non-propriétaire (aucune ligne mise à jour)', async () => {
    mocks.from.mockImplementation((table: string) => {
      capture.table = table;
      return createListingsClient({
        selectData: null,
        capture,
      });
    });

    const result = await markListingSold(LISTING_ID);

    expect(result.data).toBeNull();
    expect(result.error?.message).toMatch(/non autorisée/i);
    expect(capture.payload).toBeNull();
    expect(capture.deleteCalled).toBe(false);
    expect(mocks.trackListingMarkedSold).not.toHaveBeenCalled();
  });

  it('refuse même si un autre user_id est authentifié', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: authUser(OTHER_ID) }, error: null });
    mocks.from.mockImplementation(() =>
      createListingsClient({
        selectData: null,
        capture,
      })
    );

    const result = await markListingSold(LISTING_ID);
    expect(result.error?.message).toMatch(/non autorisée/i);
    expect(capture.filters).toEqual(
      expect.arrayContaining([{ column: 'user_id', value: OTHER_ID }])
    );
  });

  it('applique la transition active → sold', async () => {
    mocks.from.mockImplementation(() =>
      createListingsClient({
        selectData: { id: LISTING_ID, status: 'active' },
        updateData: { id: LISTING_ID, status: 'sold' },
        capture,
      })
    );

    const result = await updateListingStatus(LISTING_ID, 'sold');
    expect(result.data?.status).toBe('sold');
    expect(capture.payload).toEqual({ status: 'sold' });
  });

  it('propage une erreur backend sans supprimer la ligne', async () => {
    mocks.from.mockImplementation(() =>
      createListingsClient({
        selectData: { id: LISTING_ID, status: 'active' },
        updateError: { message: 'invalid input value for enum listing_status: "sold"' },
        capture,
      })
    );

    const result = await markListingSold(LISTING_ID);
    expect(result.data).toBeNull();
    expect(result.error?.message).toMatch(/vendue/i);
    expect(capture.deleteCalled).toBe(false);
    expect(mocks.trackListingMarkedSold).not.toHaveBeenCalled();
  });

  it('n’utilise jamais delete() pour marquer vendue', async () => {
    mocks.from.mockImplementation(() =>
      createListingsClient({
        selectData: { id: LISTING_ID, status: 'hidden' },
        updateData: { id: LISTING_ID, status: 'sold' },
        capture,
      })
    );

    await markListingSold(LISTING_ID);
    expect(capture.deleteCalled).toBe(false);
  });

  it('refuse de marquer vendue une annonce suspendue', async () => {
    mocks.from.mockImplementation(() =>
      createListingsClient({
        selectData: { id: LISTING_ID, status: 'suspended' },
        capture,
      })
    );

    const result = await markListingSold(LISTING_ID);
    expect(result.error?.message).toMatch(/suspendue/i);
    expect(capture.payload).toBeNull();
  });

  it('est idempotent si déjà vendue', async () => {
    mocks.from.mockImplementation(() =>
      createListingsClient({
        selectData: { id: LISTING_ID, status: 'sold' },
        capture,
      })
    );

    const result = await markListingSold(LISTING_ID);
    expect(result.error).toBeNull();
    expect(result.data?.status).toBe('sold');
    expect(capture.payload).toBeNull();
    expect(mocks.trackListingMarkedSold).not.toHaveBeenCalled();
  });

  it('refuse de réactiver une annonce suspendue', async () => {
    mocks.from.mockImplementation(() =>
      createListingsClient({
        selectData: { id: LISTING_ID, status: 'suspended' },
        capture,
      })
    );

    const result = await updateListingStatus(LISTING_ID, 'active');
    expect(result.data).toBeNull();
    expect(result.error?.message).toMatch(/suspendue/i);
    expect(capture.payload).toBeNull();
    expect(capture.deleteCalled).toBe(false);
  });

  it('permet au propriétaire de réactiver une annonce vendue', async () => {
    mocks.from.mockImplementation(() =>
      createListingsClient({
        selectData: { id: LISTING_ID, status: 'sold' },
        updateData: { id: LISTING_ID, status: 'active' },
        capture,
      })
    );

    const result = await updateListingStatus(LISTING_ID, 'active');
    expect(result.error).toBeNull();
    expect(result.data?.status).toBe('active');
    expect(capture.payload).toEqual({ status: 'active' });
  });

  it('refuse au vendeur d’assigner suspended', async () => {
    const result = await updateListingStatus(LISTING_ID, 'suspended');
    expect(result.error?.message).toMatch(/modération/i);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('refuse un statut hors contrat', async () => {
    const result = await updateListingStatus(LISTING_ID, 'deleted' as never);
    expect(result.error?.message).toBe('Statut annonce invalide');
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
