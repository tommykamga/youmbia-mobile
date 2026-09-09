import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  deleteSavedSearch,
  listSavedSearches,
  saveSearch,
  setSavedSearchEnabled,
} from './savedSearches';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  trackCreated: vi.fn(),
  trackDeleted: vi.fn(),
  trackToggled: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: mocks.getUser },
    from: mocks.from,
  },
}));

vi.mock('@/lib/analytics', () => ({
  trackSavedSearchCreated: (...args: unknown[]) => mocks.trackCreated(...args),
  trackSavedSearchDeleted: (...args: unknown[]) => mocks.trackDeleted(...args),
  trackSavedSearchToggled: (...args: unknown[]) => mocks.trackToggled(...args),
  trackSavedSearchOpened: vi.fn(),
}));

const USER_ID = '11111111-1111-1111-1111-111111111111';
const OTHER_ID = '22222222-2222-2222-2222-222222222222';
const SEARCH_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

type Row = {
  id: string;
  user_id: string;
  name: string | null;
  query: string;
  category_id: number | null;
  city: string | null;
  min_price: number | null;
  max_price: number | null;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

let rows: Row[];
let insertError: { code?: string; message: string } | null;
let mutationError: { message: string } | null;

function row(partial: Partial<Row> = {}): Row {
  return {
    id: partial.id ?? SEARCH_ID,
    user_id: partial.user_id ?? USER_ID,
    name: partial.name ?? 'iphone · Douala',
    query: partial.query ?? 'iphone',
    category_id: partial.category_id ?? 20,
    city: partial.city ?? 'Douala',
    min_price: partial.min_price ?? 1000,
    max_price: partial.max_price ?? 200000,
    enabled: partial.enabled ?? true,
    created_at: partial.created_at ?? '2026-09-08T10:00:00.000Z',
    updated_at: partial.updated_at ?? '2026-09-08T10:00:00.000Z',
  };
}

function criteriaKey(item: Pick<Row, 'query' | 'category_id' | 'city' | 'min_price' | 'max_price'>): string {
  return [
    item.query.trim().toLowerCase(),
    item.category_id ?? '',
    (item.city ?? '').trim().toLowerCase(),
    item.min_price ?? '',
    item.max_price ?? '',
  ].join('|');
}

function createBuilder() {
  const state: {
    op: 'select' | 'insert' | 'update' | 'delete';
    payload: Record<string, unknown> | null;
    filters: Record<string, unknown>;
    single: boolean;
  } = {
    op: 'select',
    payload: null,
    filters: {},
    single: false,
  };

  const execute = async () => {
    if (state.op === 'select') {
      const filtered = rows.filter((item) => {
        if (state.filters.user_id != null && item.user_id !== state.filters.user_id) return false;
        if (state.filters.id != null && item.id !== state.filters.id) return false;
        return true;
      });
      return { data: state.single ? filtered[0] ?? null : filtered, error: null };
    }
    if (state.op === 'insert') {
      if (insertError) return { data: null, error: insertError };
      const payload = state.payload ?? {};
      const next = row({
        id: 'new-search',
        user_id: String(payload.user_id),
        name: (payload.name as string | null) ?? null,
        query: String(payload.query ?? ''),
        category_id: (payload.category_id as number | null) ?? null,
        city: (payload.city as string | null) ?? null,
        min_price: (payload.min_price as number | null) ?? null,
        max_price: (payload.max_price as number | null) ?? null,
        enabled: payload.enabled !== false,
      });
      const duplicate = rows.some((item) => criteriaKey(item) === criteriaKey(next));
      if (duplicate) {
        return { data: null, error: { code: '23505', message: 'duplicate key' } };
      }
      rows = [next, ...rows];
      return { data: next, error: null };
    }
    if (state.op === 'update') {
      if (mutationError) return { error: mutationError };
      const id = String(state.filters.id ?? '');
      rows = rows.map((item) =>
        item.id === id ? { ...item, ...(state.payload as Partial<Row>), updated_at: '2026-09-08T11:00:00.000Z' } : item
      );
      return { error: null };
    }
    if (mutationError) return { error: mutationError };
    const id = String(state.filters.id ?? '');
    rows = rows.filter((item) => item.id !== id);
    return { error: null };
  };

  const builder: Record<string, unknown> = {
    select: () => builder,
    insert: (payload: Record<string, unknown>) => {
      state.op = 'insert';
      state.payload = payload;
      return builder;
    },
    update: (payload: Record<string, unknown>) => {
      state.op = 'update';
      state.payload = payload;
      return builder;
    },
    delete: () => {
      state.op = 'delete';
      return builder;
    },
    eq: (column: string, value: unknown) => {
      state.filters[column] = value;
      return builder;
    },
    order: () => builder,
    single: () => {
      state.single = true;
      return builder;
    },
    maybeSingle: () => {
      state.single = true;
      return execute();
    },
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
      execute().then(resolve, reject),
  };
  return builder;
}

describe('savedSearches service', () => {
  beforeEach(() => {
    rows = [];
    insertError = null;
    mutationError = null;
    mocks.getUser.mockReset();
    mocks.from.mockReset();
    mocks.trackCreated.mockReset();
    mocks.trackDeleted.mockReset();
    mocks.trackToggled.mockReset();
    mocks.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
    mocks.from.mockImplementation(() => createBuilder());
  });

  it('refuse un guest et une recherche vide', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { message: 'jwt' } });
    const guest = await saveSearch({ query: 'iphone' });
    expect(guest.ok).toBe(false);
    if (!guest.ok) expect(guest.error.message).toBe('Connexion requise');

    mocks.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
    const empty = await saveSearch({ query: '   ' });
    expect(empty.ok).toBe(false);
  });

  it('crée une recherche structurée pour le propriétaire', async () => {
    const result = await saveSearch({
      query: 'iphone',
      categoryId: 20,
      city: 'Douala',
      priceMin: 1000,
      priceMax: 200000,
    });
    expect(result.ok).toBe(true);
    if (!result.ok || result.status !== 'saved') throw new Error('expected saved');
    expect(result.item.query).toBe('iphone');
    expect(result.item.categoryId).toBe(20);
    expect(result.item.city).toBe('Douala');
    expect(result.item.enabled).toBe(true);
    expect(mocks.trackCreated).toHaveBeenCalledTimes(1);
    expect(rows[0]?.user_id).toBe(USER_ID);
  });

  it('déduplique une recherche identique (casse ville/query)', async () => {
    rows = [row({ query: 'iphone', city: 'Douala' })];
    const result = await saveSearch({
      query: 'IPHONE',
      categoryId: 20,
      city: 'douala',
      priceMin: 1000,
      priceMax: 200000,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.status).toBe('exists');
    expect(result.item.id).toBe(SEARCH_ID);
    expect(mocks.trackCreated).not.toHaveBeenCalled();
  });

  it('ne liste que les recherches du user courant', async () => {
    rows = [row(), row({ id: 'other', user_id: OTHER_ID, query: 'secret' })];
    const list = await listSavedSearches();
    expect(list).toHaveLength(1);
    expect(list[0]?.query).toBe('iphone');
    expect(list.some((item) => item.query === 'secret')).toBe(false);
  });

  it('active / désactive une alerte', async () => {
    rows = [row({ enabled: true })];
    const result = await setSavedSearchEnabled(SEARCH_ID, false);
    expect(result.ok).toBe(true);
    expect(rows[0]?.enabled).toBe(false);
    expect(mocks.trackToggled).toHaveBeenCalledWith({
      saved_search_id: SEARCH_ID,
      enabled: false,
    });
  });

  it('supprime une recherche', async () => {
    rows = [row()];
    const result = await deleteSavedSearch(SEARCH_ID);
    expect(result.ok).toBe(true);
    expect(rows).toHaveLength(0);
    expect(mocks.trackDeleted).toHaveBeenCalledWith({ saved_search_id: SEARCH_ID });
  });

  it('remonte une erreur backend sans casser l’UI', async () => {
    insertError = { message: 'network timeout' };
    const result = await saveSearch({ query: 'iphone', city: 'Douala' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toBe('Réseau indisponible');
  });

  it('n’appelle pas les notifications locales lors d’une sauvegarde (permission push hors chemin)', async () => {
    const result = await saveSearch({ query: 'iphone', city: 'Douala' });
    expect(result.ok).toBe(true);
    expect(mocks.from).toHaveBeenCalledWith('saved_searches');
    expect(mocks.from).not.toHaveBeenCalledWith('user_push_tokens');
  });
});

describe('saved_search_alerts migration contract', () => {
  const sql = readFileSync(
    resolve(process.cwd(), 'supabase/migrations/20260908250000_saved_search_alerts_v1.sql'),
    'utf8'
  );
  const createListing = readFileSync(
    resolve(process.cwd(), 'src/services/listings/createListing.ts'),
    'utf8'
  );
  const layout = readFileSync(resolve(process.cwd(), 'app/_layout.tsx'), 'utf8');
  const search = readFileSync(resolve(process.cwd(), 'src/services/listings/searchListings.ts'), 'utf8');
  const edge = readFileSync(
    resolve(process.cwd(), 'supabase/functions/dispatch-saved-search-alerts/index.ts'),
    'utf8'
  );

  it('crée des colonnes structurées, RLS owner, ledger unique, trigger INSERT only', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.saved_searches/);
    expect(sql).toMatch(/query text NOT NULL DEFAULT ''/);
    expect(sql).toMatch(/category_id integer/);
    expect(sql).toMatch(/min_price integer/);
    expect(sql).toMatch(/max_price integer/);
    expect(sql).not.toMatch(/filters jsonb/);
    expect(sql).toMatch(/saved_searches_select_own/);
    expect(sql).toMatch(/user_id = \(SELECT auth\.uid\(\)\)/);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.saved_search_matches/);
    expect(sql).toMatch(/UNIQUE \(saved_search_id, listing_id\)/);
    expect(sql).toMatch(/REVOKE ALL ON TABLE public\.saved_search_matches FROM authenticated/);
    expect(sql).toMatch(/AFTER INSERT ON public\.listings/);
    expect(sql).not.toMatch(/AFTER UPDATE ON public\.listings/);
    expect(sql).toMatch(/pas de trigger sur renewed_at \/ UPDATE/);
    expect(sql).toMatch(/WHEN \(NEW\.status = 'active'\)/);
    expect(sql).toMatch(/s\.user_id IS DISTINCT FROM NEW\.user_id/);
    expect(sql).not.toMatch(/created_at < now\(\) - interval '1 hour'/);
    expect(sql).toMatch(/ON CONFLICT \(saved_search_id, listing_id\) DO NOTHING/);
    expect(sql).not.toMatch(/LIMIT 200/);
    expect(sql).toMatch(/CREATE EXTENSION IF NOT EXISTS pg_net/);
    expect(sql).toMatch(/net\.http_post/);
    expect(sql).toMatch(/enqueue_saved_search_alert_dispatch/);
    expect(sql).toMatch(/X-Saved-Search-Dispatch-Secret/);
    expect(sql).toMatch(/saved_searches_enabled_user_idx/);
    expect(sql).toMatch(/saved_searches_enabled_category_idx/);
    expect(sql).toMatch(/saved_search_matches_pending_listing_idx/);
    expect(sql).toMatch(/saved_search_matches_stale_claim_idx/);
    expect(sql).toMatch(/CREATE EXTENSION IF NOT EXISTS pg_cron;/);
    expect(sql).toMatch(/retry_pending_saved_search_alerts/);
    expect(sql).toMatch(/cron\.schedule/);
    expect(sql).toMatch(/'\*\/5 \* \* \* \*'/);
    expect(sql).toMatch(/GROUP BY m\.listing_id/);
    expect(sql).toMatch(/LIMIT 100/);
    expect(sql).toMatch(/SET search_path = ''/);
    expect(sql).toMatch(/SECURITY DEFINER\s+SET search_path = ''/);
  });

  it('cron obligatoire : CREATE EXTENSION hors DO, pas de WARNING qui avale l’échec', () => {
    const pgCronExt = sql.indexOf('CREATE EXTENSION IF NOT EXISTS pg_cron');
    const cronSchedule = sql.indexOf('cron.schedule');
    expect(pgCronExt).toBeGreaterThan(-1);
    expect(cronSchedule).toBeGreaterThan(pgCronExt);
    expect(sql).not.toMatch(/pg_cron unavailable/);
    expect(sql.slice(cronSchedule)).not.toMatch(/EXCEPTION/);
    expect(sql).not.toMatch(/RAISE WARNING[\s\S]{0,80}retry saved-search/);
  });

  it('claim atomique + expired_at (jamais notified_at pour une expiration 24h)', () => {
    expect(sql).toMatch(/dispatch_claimed_at timestamptz/);
    expect(sql).toMatch(/dispatch_claim_id uuid/);
    expect(sql).toMatch(/expired_at timestamptz/);
    expect(sql).toMatch(/claim_saved_search_alerts/);
    expect(sql).toMatch(/complete_saved_search_alert_claim/);
    expect(sql).toMatch(/FOR UPDATE SKIP LOCKED/);
    expect(sql).toMatch(/interval '10 minutes'/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.claim_saved_search_alerts\(uuid, uuid\) TO service_role/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.claim_saved_search_alerts\(uuid, uuid\) FROM authenticated/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.complete_saved_search_alert_claim\(uuid, uuid\[\], text\) TO service_role/);
    expect(sql).toMatch(/REVOKE ALL ON TABLE public\.saved_search_matches FROM service_role/);
    const retryFn = sql.slice(sql.indexOf('retry_pending_saved_search_alerts'));
    expect(retryFn).toMatch(/expired_at = pg_catalog\.now\(\)/);
    expect(retryFn).toMatch(/m\.expired_at IS NULL/);
    expect(retryFn).not.toMatch(/SET\s+notified_at = pg_catalog\.now\(\)\s+WHERE m\.notified_at IS NULL/);
  });

  it('dispatch push via pg_net serveur, sans createListing ni polling client', () => {
    expect(createListing).not.toMatch(/dispatch-saved-search-alerts/);
    expect(createListing).not.toMatch(/functions/);
    expect(edge).toMatch(/user_push_tokens/);
    expect(edge).toMatch(/exp\.host\/--\/api\/v2\/push\/send/);
    expect(edge).toMatch(/type: 'saved_search_match'/);
    expect(edge).toMatch(/X-Saved-Search-Dispatch-Secret/);
    expect(edge).toMatch(/SAVED_SEARCH_DISPATCH_SECRET/);
    expect(edge).toMatch(/SUPABASE_SECRET_KEYS/);
    expect(edge).toMatch(/secretKeys\['default'\]/);
    expect(edge).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(edge).toMatch(/@supabase\/supabase-js@2\.99\.3/);
    expect(edge).toMatch(/bodyKeys\.length !== 1 \|\| bodyKeys\[0\] !== 'listing_id'/);
    expect(edge).not.toMatch(/FORBIDDEN_BODY_KEYS/);
    expect(edge).toMatch(/claim_saved_search_alerts/);
    expect(edge).toMatch(/complete_saved_search_alert_claim/);
    expect(edge).toMatch(/completeClaim\(admin, claimId, notifiedMatchIds, 'notified'\)/);
    expect(edge).toMatch(/completeClaim\(admin, claimId, releasedMatchIds, 'released'\)/);
    expect(edge).toMatch(/completeClaim\(admin, claimId, \[\.\.\.held\], 'expired'\)/);
    expect(edge).not.toMatch(/from\('saved_search_matches'\)/);
    expect(edge).not.toMatch(/getUser/);
    expect(edge).not.toMatch(/listing_too_old/);
    expect(layout).not.toMatch(/savedSearchNotifications/);
    expect(layout).not.toMatch(/syncSavedSearchNotifications/);
    expect(search).toMatch(/\.eq\('status', 'active'\)/);
  });
});
