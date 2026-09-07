import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetReportInFlightForTests, submitReport } from './submitReport';

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
const OTHER_ID = '22222222-2222-2222-2222-222222222222';
const LISTING_ID = '33333333-3333-3333-3333-333333333333';
const CONV_ID = '44444444-4444-4444-4444-444444444444';
const MIGRATION_PATH = resolve(
  process.cwd(),
  'supabase/migrations/20260903220000_conversation_reports_v1.sql'
);

function authUser(id = USER_ID) {
  return { id };
}

describe('conversation_reports migration contract', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');

  it('crée la table minimale sans copier de messages', () => {
    const tableSql = sql.slice(0, sql.indexOf('ALTER TABLE public.conversation_reports'));
    expect(tableSql).toMatch(/CREATE TABLE IF NOT EXISTS public\.conversation_reports/);
    expect(tableSql).toMatch(/conversation_id uuid NOT NULL/);
    expect(tableSql).toMatch(/user_id uuid NOT NULL/);
    expect(tableSql).toMatch(/reason text NOT NULL/);
    expect(tableSql).toMatch(/comment text/);
    expect(tableSql).not.toMatch(/message_body/);
    expect(tableSql).not.toMatch(/FROM public\.messages/);
  });

  it('restreint RLS à l’insert participant et à la lecture de ses propres lignes', () => {
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/conversation_reports_insert_own/);
    expect(sql).toMatch(/FOR INSERT/);
    expect(sql).toMatch(/c\.buyer_id = \(SELECT auth\.uid\(\)\)/);
    expect(sql).toMatch(/conversation_reports_select_own/);
    expect(sql).toMatch(/FOR SELECT/);
    expect(sql).toMatch(/USING \(user_id = \(SELECT auth\.uid\(\)\)\)/);
    expect(sql).not.toMatch(/FOR UPDATE/);
    expect(sql).not.toMatch(/FOR DELETE/);
  });
});

describe('submitReport', () => {
  let inserts: { table: string; payload: Record<string, unknown> }[];

  beforeEach(() => {
    resetReportInFlightForTests();
    inserts = [];
    mocks.getUser.mockReset();
    mocks.from.mockReset();
    mocks.getUser.mockResolvedValue({ data: { user: authUser() }, error: null });
    mocks.from.mockImplementation((table: string) => {
      if (table === 'listings') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { user_id: OTHER_ID },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'conversations') {
        return {
          select: () => ({
            eq: () => ({
              or: () => ({
                maybeSingle: async () => ({
                  data: { id: CONV_ID, buyer_id: USER_ID, seller_id: OTHER_ID },
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      return {
        insert: async (payload: Record<string, unknown>) => {
          inserts.push({ table, payload });
          return { error: null };
        },
      };
    });
  });

  it('refuse un utilisateur non authentifié', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { message: 'jwt' } });
    const result = await submitReport({
      targetType: 'listing',
      targetId: LISTING_ID,
      reason: 'scam',
    });
    expect(result.error?.message).toBe('Non connecté');
    expect(inserts).toHaveLength(0);
  });

  it('refuse un target_type inconnu', async () => {
    const result = await submitReport({
      targetType: 'moderation-queue',
      targetId: LISTING_ID,
      reason: 'scam',
    });
    expect(result.error?.message).toBe('Type de signalement invalide');
  });

  it('insère un signalement listing sans contenu métier sensible', async () => {
    const result = await submitReport({
      targetType: 'listing',
      targetId: LISTING_ID,
      reason: 'scam',
      comment: 'ne doit pas partir hors other',
    });
    expect(result.error).toBeNull();
    expect(inserts).toEqual([
      {
        table: 'listing_reports',
        payload: {
          listing_id: LISTING_ID,
          user_id: USER_ID,
          reason: 'scam',
        },
      },
    ]);
  });

  it('bloque l’auto-signalement d’annonce', async () => {
    const result = await submitReport({
      targetType: 'listing',
      targetId: LISTING_ID,
      reason: 'scam',
      sellerId: USER_ID,
    });
    expect(result.error?.message).toMatch(/propre contenu/);
    expect(inserts).toHaveLength(0);
  });

  it('mappe une erreur réseau', async () => {
    mocks.from.mockImplementation((table: string) => {
      if (table === 'listings') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { user_id: OTHER_ID }, error: null }),
            }),
          }),
        };
      }
      return {
        insert: async () => ({ error: { message: 'Network request failed', code: 'ETIMEDOUT' } }),
      };
    });
    const result = await submitReport({
      targetType: 'listing',
      targetId: LISTING_ID,
      reason: 'duplicate',
    });
    expect(result.error?.message).toBe('Réseau indisponible. Réessayez.');
  });

  it('refuse une conversation inaccessible et n’y copie aucun message', async () => {
    mocks.from.mockImplementation((table: string) => {
      if (table === 'conversations') {
        return {
          select: () => ({
            eq: () => ({
              or: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
          }),
        };
      }
      return {
        insert: async (payload: Record<string, unknown>) => {
          inserts.push({ table, payload });
          return { error: null };
        },
      };
    });
    const result = await submitReport({
      targetType: 'conversation',
      targetId: CONV_ID,
      reason: 'abusive_content',
      comment: 'contenu abusif',
    });
    expect(result.error?.message).toBe('Conversation inaccessible.');
    expect(inserts).toHaveLength(0);
  });

  it('signale une conversation sans body de messages', async () => {
    const result = await submitReport({
      targetType: 'conversation',
      targetId: CONV_ID,
      reason: 'other',
      comment: 'hors sujet',
    });
    expect(result.error).toBeNull();
    expect(inserts[0]?.table).toBe('conversation_reports');
    expect(inserts[0]?.payload).toEqual({
      conversation_id: CONV_ID,
      user_id: USER_ID,
      reason: 'other',
      comment: 'hors sujet',
    });
    expect(JSON.stringify(inserts[0]?.payload)).not.toMatch(/body/);
  });

  it('empêche une double soumission concurrente', async () => {
    let releaseInsert: (() => void) | undefined;
    const insertGate = new Promise<void>((resolve) => {
      releaseInsert = resolve;
    });
    mocks.from.mockImplementation((table: string) => {
      if (table === 'listings') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { user_id: OTHER_ID }, error: null }),
            }),
          }),
        };
      }
      return {
        insert: async (payload: Record<string, unknown>) => {
          await insertGate;
          inserts.push({ table, payload });
          return { error: null };
        },
      };
    });

    const first = submitReport({
      targetType: 'listing',
      targetId: LISTING_ID,
      reason: 'scam',
    });
    const secondResult = await submitReport({
      targetType: 'listing',
      targetId: LISTING_ID,
      reason: 'scam',
    });
    expect(secondResult.error?.message).toBe('Signalement déjà en cours.');
    releaseInsert?.();
    const firstResult = await first;
    expect(firstResult.error).toBeNull();
    expect(inserts).toHaveLength(1);
  });

  it('traite un doublon SQL comme succès idempotent', async () => {
    mocks.from.mockImplementation((table: string) => {
      if (table === 'conversations') {
        return {
          select: () => ({
            eq: () => ({
              or: () => ({
                maybeSingle: async () => ({
                  data: { id: CONV_ID, buyer_id: USER_ID, seller_id: OTHER_ID },
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      return {
        insert: async () => ({ error: { code: '23505', message: 'duplicate key' } }),
      };
    });
    const result = await submitReport({
      targetType: 'conversation',
      targetId: CONV_ID,
      reason: 'scam',
    });
    expect(result.error).toBeNull();
  });
});
