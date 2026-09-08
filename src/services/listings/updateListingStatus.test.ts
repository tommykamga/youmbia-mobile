import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { markListingSold, updateListingStatus } from './updateListingStatus';
import { LISTING_STATUS } from '@/lib/listingStatus';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  trackListingMarkedSold: vi.fn(),
  trackListingRenewed: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: mocks.getUser },
    from: mocks.from,
  },
}));

vi.mock('@/lib/analytics', () => ({
  trackListingMarkedSold: mocks.trackListingMarkedSold,
  trackListingRenewed: mocks.trackListingRenewed,
}));

const USER_ID = '11111111-1111-1111-1111-111111111111';
const OTHER_ID = '22222222-2222-2222-2222-222222222222';
const LISTING_ID = '33333333-3333-3333-3333-333333333333';
const SOLD_STATUS_MIGRATION_PATH = resolve(
  process.cwd(),
  'supabase/migrations/20260908220000_listing_status_sold_v1.sql'
);
const SALE_CYCLE_MIGRATION_PATH = resolve(
  process.cwd(),
  'supabase/migrations/20260908230000_listing_sale_cycle_v1.sql'
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
  timingData?: {
    created_at: string;
    sold_at: string | null;
    sale_cycle_started_at?: string | null;
  } | null;
  timingError?: { message: string } | null;
  capture: UpdateCapture;
}) {
  return {
    select: (columns: string) => {
      const isTimingSelect = columns.includes('sold_at');
      if (!isTimingSelect) {
        expect(columns).toContain('status');
        expect(columns).not.toContain('sold_at');
        expect(columns).not.toContain('sale_cycle_started_at');
        expect(columns).not.toContain('renewed_at');
      }
      const chain = {
        eq: (column: string, value: unknown) => {
          options.capture.filters.push({ column, value });
          return chain;
        },
        maybeSingle: async () => {
          if (isTimingSelect) {
            return {
              data: options.timingData ?? null,
              error: options.timingError ?? null,
            };
          }
          return {
            data: options.selectData ?? null,
            error: options.selectError ?? null,
          };
        },
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
        select: (columns?: string) => {
          if (columns) {
            expect(columns).not.toContain('sold_at');
            expect(columns).not.toContain('sale_cycle_started_at');
            expect(columns).not.toContain('renewed_at');
          }
          return chain;
        },
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
  const sql = readFileSync(SOLD_STATUS_MIGRATION_PATH, 'utf8');

  it('ajoute sold de façon additive sans DELETE ni rewrite', () => {
    expect(sql).toMatch(/ALTER TYPE public\.listing_status ADD VALUE IF NOT EXISTS 'sold'/);
    expect(sql).not.toMatch(/DELETE FROM public\.listings/i);
    expect(sql).not.toMatch(/UPDATE public\.listings/i);
    expect(sql).toMatch(/Ne pas appliquer cette migration sans validation/);
  });
});

describe('listings sale cycle migration contract', () => {
  const sql = readFileSync(SALE_CYCLE_MIGRATION_PATH, 'utf8');

  it('crée le trigger BEFORE INSERT OR UPDATE (pas UPDATE OF status)', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS sold_at timestamptz NULL/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS sale_cycle_started_at timestamptz NULL/);
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.set_listings_sale_cycle\(\)/);
    expect(sql).toMatch(/DROP TRIGGER IF EXISTS listings_set_sale_cycle\s+ON public\.listings;/);
    expect(sql).toMatch(
      /CREATE TRIGGER listings_set_sale_cycle\s+BEFORE INSERT OR UPDATE\s+ON public\.listings\s+FOR EACH ROW\s+EXECUTE FUNCTION public\.set_listings_sale_cycle\(\);/
    );
    const triggerDdl = sql.slice(sql.indexOf('CREATE TRIGGER listings_set_sale_cycle'));
    expect(triggerDdl).not.toMatch(/UPDATE OF/i);
    expect(sql).not.toMatch(/DROP TRIGGER IF EXISTS trg_listings_set_updated_at/);
    expect(sql).not.toMatch(/UPDATE public\.listings/i);
    expect(sql).not.toMatch(/NEW\.created_at\s*:=/);
    expect(sql).not.toMatch(/NEW\.updated_at/);
    expect(sql).toMatch(/Ne pas appliquer cette migration sans validation/);
  });

  it('restaure OLD avant toute transition (falsification client impossible)', () => {
    const restoreSold = sql.indexOf('NEW.sold_at := OLD.sold_at');
    const restoreCycle = sql.indexOf('NEW.sale_cycle_started_at := OLD.sale_cycle_started_at');
    const enterSold = sql.indexOf("NEW.status = 'sold' AND OLD.status IS DISTINCT FROM 'sold'");
    expect(restoreSold).toBeGreaterThan(-1);
    expect(restoreCycle).toBeGreaterThan(-1);
    expect(enterSold).toBeGreaterThan(restoreSold);
    expect(enterSold).toBeGreaterThan(restoreCycle);
  });

  it('redémarre le cycle seulement en sortant de sold vers active/hidden', () => {
    expect(sql).toMatch(
      /OLD\.status = 'sold' AND NEW\.status IN \('active', 'hidden'\)[\s\S]*NEW\.sale_cycle_started_at := now\(\)/
    );
    expect(sql).toMatch(/OLD\.status = 'sold' AND NEW\.status = 'suspended'/);
  });
});

describe('updateListingStatus / markListingSold', () => {
  let capture: UpdateCapture;

  beforeEach(() => {
    capture = { table: null, payload: null, filters: [], deleteCalled: false };
    mocks.getUser.mockReset();
    mocks.from.mockReset();
    mocks.trackListingMarkedSold.mockReset();
    mocks.trackListingRenewed.mockReset();
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
    expect(capture.deleteCalled).toBe(false);
    expect(mocks.trackListingRenewed).toHaveBeenCalledWith({
      listing_id: LISTING_ID,
      source: 'sold_reactivation',
    });
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

  it('n’écrit jamais sold_at ni sale_cycle_started_at depuis le client (active → sold)', async () => {
    mocks.from.mockImplementation(() =>
      createListingsClient({
        selectData: { id: LISTING_ID, status: 'active' },
        updateData: { id: LISTING_ID, status: 'sold' },
        capture,
      })
    );

    await markListingSold(LISTING_ID);
    expect(capture.payload).toEqual({ status: 'sold' });
    expect(capture.payload).not.toHaveProperty('sold_at');
    expect(capture.payload).not.toHaveProperty('sale_cycle_started_at');
    expect(capture.payload).not.toHaveProperty('renewed_at');
    expect(capture.payload).not.toHaveProperty('created_at');
    expect(capture.payload).not.toHaveProperty('updated_at');
  });

  it('n’écrit jamais sold_at ni sale_cycle_started_at depuis le client (sold → active)', async () => {
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
    expect(capture.payload).not.toHaveProperty('sold_at');
    expect(capture.payload).not.toHaveProperty('sale_cycle_started_at');
    expect(capture.payload).not.toHaveProperty('renewed_at');
    expect(capture.payload).not.toHaveProperty('created_at');
    expect(mocks.trackListingRenewed).toHaveBeenCalledWith({
      listing_id: LISTING_ID,
      source: 'sold_reactivation',
    });
  });

  it('hidden → active ne pose pas renewed_at et track hidden_reactivation', async () => {
    mocks.from.mockImplementation(() =>
      createListingsClient({
        selectData: { id: LISTING_ID, status: 'hidden' },
        updateData: { id: LISTING_ID, status: 'active' },
        capture,
      })
    );

    const result = await updateListingStatus(LISTING_ID, 'active');
    expect(result.error).toBeNull();
    expect(result.data?.status).toBe('active');
    expect(capture.payload).toEqual({ status: 'active' });
    expect(capture.payload).not.toHaveProperty('renewed_at');
    expect(capture.deleteCalled).toBe(false);
    expect(mocks.trackListingRenewed).toHaveBeenCalledWith({
      listing_id: LISTING_ID,
      source: 'hidden_reactivation',
    });
  });

  it('déjà active : no-op, pas de listing_renewed', async () => {
    mocks.from.mockImplementation(() =>
      createListingsClient({
        selectData: { id: LISTING_ID, status: 'active' },
        capture,
      })
    );

    const result = await updateListingStatus(LISTING_ID, 'active');
    expect(result.error).toBeNull();
    expect(result.data?.status).toBe('active');
    expect(capture.payload).toBeNull();
    expect(mocks.trackListingRenewed).not.toHaveBeenCalled();
  });

  it('autorise un second passage sold après réactivation', async () => {
    let current: 'active' | 'sold' = 'sold';
    mocks.from.mockImplementation(() =>
      createListingsClient({
        selectData: { id: LISTING_ID, status: current },
        updateData: {
          id: LISTING_ID,
          status: current === 'sold' ? 'active' : 'sold',
        },
        capture,
      })
    );

    const reactivated = await updateListingStatus(LISTING_ID, 'active');
    expect(reactivated.error).toBeNull();
    expect(reactivated.data?.status).toBe('active');
    expect(capture.payload).toEqual({ status: 'active' });

    current = 'active';
    capture.payload = null;
    mocks.trackListingMarkedSold.mockClear();

    const resold = await markListingSold(LISTING_ID);
    expect(resold.error).toBeNull();
    expect(resold.data?.status).toBe('sold');
    expect(capture.payload).toEqual({ status: 'sold' });
    expect(mocks.trackListingMarkedSold).toHaveBeenCalledTimes(1);
  });

  it('enrichit listing_marked_sold avec time_to_sale_seconds du cycle courant', async () => {
    mocks.from.mockImplementation(() =>
      createListingsClient({
        selectData: { id: LISTING_ID, status: 'active' },
        updateData: { id: LISTING_ID, status: 'sold' },
        timingData: {
          created_at: '2026-01-01T00:00:00.000Z',
          sale_cycle_started_at: '2026-01-10T00:00:00.000Z',
          sold_at: '2026-01-11T00:00:00.000Z',
        },
        capture,
      })
    );

    await markListingSold(LISTING_ID);
    expect(mocks.trackListingMarkedSold).toHaveBeenCalledWith({
      listing_id: LISTING_ID,
      time_to_sale_seconds: 86_400,
    });
  });

  it('enrichit listing_marked_sold en legacy (sale_cycle_started_at null → created_at)', async () => {
    mocks.from.mockImplementation(() =>
      createListingsClient({
        selectData: { id: LISTING_ID, status: 'active' },
        updateData: { id: LISTING_ID, status: 'sold' },
        timingData: {
          created_at: '2026-01-01T00:00:00.000Z',
          sold_at: '2026-01-02T00:00:00.000Z',
          sale_cycle_started_at: null,
        },
        capture,
      })
    );

    await markListingSold(LISTING_ID);
    expect(mocks.trackListingMarkedSold).toHaveBeenCalledWith({
      listing_id: LISTING_ID,
      time_to_sale_seconds: 86_400,
    });
  });

  it('n’invente pas time_to_sale_seconds si sold_at est null', async () => {
    mocks.from.mockImplementation(() =>
      createListingsClient({
        selectData: { id: LISTING_ID, status: 'hidden' },
        updateData: { id: LISTING_ID, status: 'sold' },
        timingData: { created_at: '2026-01-01T00:00:00.000Z', sold_at: null },
        capture,
      })
    );

    await markListingSold(LISTING_ID);
    expect(mocks.trackListingMarkedSold).toHaveBeenCalledWith({ listing_id: LISTING_ID });
  });

  it('garde le marquage vendue si la lecture sold_at échoue (colonne absente)', async () => {
    mocks.from.mockImplementation(() =>
      createListingsClient({
        selectData: { id: LISTING_ID, status: 'active' },
        updateData: { id: LISTING_ID, status: 'sold' },
        timingError: { message: 'column listings.sold_at does not exist' },
        capture,
      })
    );

    const result = await markListingSold(LISTING_ID);
    expect(result.error).toBeNull();
    expect(result.data?.status).toBe('sold');
    expect(mocks.trackListingMarkedSold).toHaveBeenCalledWith({ listing_id: LISTING_ID });
  });
});
