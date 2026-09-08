import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renewListing } from './renewListing';
import { LISTING_STATUS } from '@/lib/listingStatus';
import { LISTING_RENEWAL_COOLDOWN_ERROR } from '@/lib/listingRenewal';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  trackListingRenewed: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: mocks.getUser },
    from: mocks.from,
  },
}));

vi.mock('@/lib/analytics', () => ({
  trackListingRenewed: mocks.trackListingRenewed,
}));

const USER_ID = '11111111-1111-1111-1111-111111111111';
const OTHER_ID = '22222222-2222-2222-2222-222222222222';
const LISTING_ID = '33333333-3333-3333-3333-333333333333';
const RENEWAL_MIGRATION_PATH = resolve(
  process.cwd(),
  'supabase/migrations/20260908240000_listing_renewed_at_v1.sql'
);

function authUser(id = USER_ID) {
  return { id };
}

type UpdateCapture = {
  table: string | null;
  payload: Record<string, unknown> | null;
  filters: { column: string; value: unknown }[];
  insertCalled: boolean;
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
      expect(columns).not.toContain('created_at');
      expect(columns).not.toContain('sold_at');
      expect(columns).not.toContain('sale_cycle_started_at');
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
    insert: () => {
      options.capture.insertCalled = true;
      return { select: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) };
    },
    delete: () => {
      options.capture.deleteCalled = true;
      return { eq: () => ({ eq: async () => ({ error: null }) }) };
    },
  };
}

describe('listings renewed_at migration contract', () => {
  const sql = readFileSync(RENEWAL_MIGRATION_PATH, 'utf8');

  it('ajoute renewed_at nullable et last_published_at généré, sans backfill', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS renewed_at timestamptz NULL/);
    expect(sql).toMatch(
      /GENERATED ALWAYS AS \(COALESCE\(renewed_at, created_at\)\) STORED/
    );
    expect(sql).not.toMatch(/UPDATE public\.listings/i);
    expect(sql).not.toMatch(/DELETE FROM public\.listings/i);
    expect(sql).toMatch(/Ne pas appliquer cette migration sans validation/);
  });

  it('ne touche pas created_at, updated_at, sold_at ni sale_cycle_started_at', () => {
    expect(sql).not.toMatch(/NEW\.created_at\s*:=/);
    expect(sql).not.toMatch(/NEW\.updated_at/);
    expect(sql).not.toMatch(/NEW\.sold_at/);
    expect(sql).not.toMatch(/NEW\.sale_cycle_started_at/);
    expect(sql).not.toMatch(/DROP TRIGGER IF EXISTS listings_set_sale_cycle/);
    expect(sql).not.toMatch(/DROP TRIGGER IF EXISTS trg_listings_set_updated_at/);
    expect(sql).toMatch(/RETURN NEW/);
    expect(sql).not.toMatch(/UPDATE public\.listings SET/i);
  });

  it('sold → active boost conditionnel ; hidden → active sans boost ; cooldown 3 jours en DB', () => {
    expect(sql).toMatch(/OLD\.status = 'sold' AND NEW\.status = 'active'/);
    expect(sql).toMatch(
      /last_publication IS NOT NULL AND now\(\) >= last_publication \+ interval '3 days'/
    );
    expect(sql).toMatch(/OLD\.status = 'active' AND NEW\.status = 'active' AND requested_renew/);
    expect(sql).toMatch(/COALESCE\(OLD\.renewed_at, OLD\.created_at\)/);
    expect(sql).toMatch(/interval '3 days'/);
    expect(sql).toContain(LISTING_RENEWAL_COOLDOWN_ERROR);
    expect(sql).toMatch(/RAISE EXCEPTION 'Cette annonce ne peut être renouvelée que toutes les 3 jours\.'/);
    expect(sql).toMatch(/OLD\.status = 'suspended' AND requested_renew/);
    expect(sql).not.toMatch(
      /OLD\.status = 'sold' AND NEW\.status = 'active' THEN\s+NEW\.renewed_at := now\(\);/
    );
    expect(sql).not.toMatch(/OLD\.status = 'hidden' AND NEW\.status = 'active'[\s\S]*NEW\.renewed_at := now\(\)/);
    expect(sql).not.toMatch(/OLD\.sold_at/);
  });
});

describe('renewListing', () => {
  let capture: UpdateCapture;

  beforeEach(() => {
    capture = { table: null, payload: null, filters: [], insertCalled: false, deleteCalled: false };
    mocks.getUser.mockReset();
    mocks.from.mockReset();
    mocks.trackListingRenewed.mockReset();
    mocks.getUser.mockResolvedValue({ data: { user: authUser() }, error: null });
  });

  it('renouvelle une annonce active sans dupliquer la ligne', async () => {
    mocks.from.mockImplementation((table: string) => {
      capture.table = table;
      return createListingsClient({
        selectData: { id: LISTING_ID, status: 'active' },
        updateData: { id: LISTING_ID, status: 'active' },
        capture,
      });
    });

    const result = await renewListing(LISTING_ID);

    expect(result.error).toBeNull();
    expect(result.data).toEqual({ id: LISTING_ID, status: LISTING_STATUS.active });
    expect(capture.table).toBe('listings');
    expect(capture.payload).toHaveProperty('renewed_at');
    expect(capture.payload).not.toHaveProperty('created_at');
    expect(capture.payload).not.toHaveProperty('updated_at');
    expect(capture.payload).not.toHaveProperty('status');
    expect(capture.payload).not.toHaveProperty('sold_at');
    expect(capture.payload).not.toHaveProperty('sale_cycle_started_at');
    expect(capture.insertCalled).toBe(false);
    expect(capture.deleteCalled).toBe(false);
    expect(mocks.trackListingRenewed).toHaveBeenCalledWith({
      listing_id: LISTING_ID,
      source: 'manual_renewal',
    });
  });

  it('propage le refus DB d’un double renewal immédiat, sans INSERT', async () => {
    mocks.from.mockImplementation(() =>
      createListingsClient({
        selectData: { id: LISTING_ID, status: 'active' },
        updateError: { message: LISTING_RENEWAL_COOLDOWN_ERROR },
        capture,
      })
    );

    const result = await renewListing(LISTING_ID);
    expect(result.data).toBeNull();
    expect(result.error?.message).toBe(LISTING_RENEWAL_COOLDOWN_ERROR);
    expect(capture.insertCalled).toBe(false);
    expect(capture.deleteCalled).toBe(false);
    expect(mocks.trackListingRenewed).not.toHaveBeenCalled();
  });

  it('mappe un message PostgREST wrappé vers le cooldown', async () => {
    mocks.from.mockImplementation(() =>
      createListingsClient({
        selectData: { id: LISTING_ID, status: 'active' },
        updateError: {
          message:
            'ERROR:  P0001: Cette annonce ne peut être renouvelée que toutes les 3 jours. CONTEXT: PL/pgSQL function set_listings_renewed_at()',
        },
        capture,
      })
    );

    const result = await renewListing(LISTING_ID);
    expect(result.error?.message).toBe(LISTING_RENEWAL_COOLDOWN_ERROR);
    expect(mocks.trackListingRenewed).not.toHaveBeenCalled();
  });

  it('refuse une annonce suspendue', async () => {
    mocks.from.mockImplementation(() =>
      createListingsClient({
        selectData: { id: LISTING_ID, status: 'suspended' },
        capture,
      })
    );

    const result = await renewListing(LISTING_ID);
    expect(result.error?.message).toMatch(/suspendue/i);
    expect(capture.payload).toBeNull();
    expect(mocks.trackListingRenewed).not.toHaveBeenCalled();
  });

  it('refuse sold / hidden (réactivation, pas renewal manuel)', async () => {
    mocks.from.mockImplementation(() =>
      createListingsClient({
        selectData: { id: LISTING_ID, status: 'sold' },
        capture,
      })
    );
    const sold = await renewListing(LISTING_ID);
    expect(sold.error?.message).toMatch(/en ligne/i);
    expect(capture.payload).toBeNull();

    mocks.from.mockImplementation(() =>
      createListingsClient({
        selectData: { id: LISTING_ID, status: 'hidden' },
        capture,
      })
    );
    const hidden = await renewListing(LISTING_ID);
    expect(hidden.error?.message).toMatch(/en ligne/i);
  });

  it('refuse un non-propriétaire', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: authUser(OTHER_ID) }, error: null });
    mocks.from.mockImplementation(() =>
      createListingsClient({
        selectData: null,
        capture,
      })
    );

    const result = await renewListing(LISTING_ID);
    expect(result.error?.message).toMatch(/non autorisée/i);
    expect(capture.payload).toBeNull();
  });

  it('propage une erreur backend sans recréer l’annonce', async () => {
    mocks.from.mockImplementation(() =>
      createListingsClient({
        selectData: { id: LISTING_ID, status: 'active' },
        updateError: { message: 'column listings.renewed_at does not exist' },
        capture,
      })
    );

    const result = await renewListing(LISTING_ID);
    expect(result.data).toBeNull();
    expect(result.error?.message).toMatch(/renewed_at/i);
    expect(capture.insertCalled).toBe(false);
    expect(mocks.trackListingRenewed).not.toHaveBeenCalled();
  });
});
