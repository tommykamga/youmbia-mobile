import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  fetchConversationIdsWithAtLeastOneMessage,
  MESSAGE_PRESENCE_ROW_PAGE,
} from './getConversationsMessagePresence';

type Row = { conversation_id: string };

type RangeCall = { inIds: string[]; from: number; to: number };

const rangeCalls = vi.fn<
  (args: RangeCall) => Promise<{ data: Row[] | null; error: { message: string } | null }>
>();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => {
      let inIds: string[] = [];
      const chain: Record<string, unknown> = {
        select: () => chain,
        in: (_col: string, arr: string[]) => {
          inIds = [...arr].sort();
          return chain;
        },
        order: () => chain,
        range: (from: number, to: number) =>
          rangeCalls({ inIds, from, to }),
      };
      return chain;
    }),
  },
}));

describe('fetchConversationIdsWithAtLeastOneMessage — pagination', () => {
  beforeEach(() => {
    rangeCalls.mockReset();
  });

  it('réinitialise l’offset quand remaining rétrécit après une page pleine (>1000 lignes hors conv ciblée)', async () => {
    /** Conv A n’a sa preuve qu’après la 2e requête (première page saturée par b+c). */
    const ids = ['a', 'b', 'c'];
    let callIdx = 0;
    rangeCalls.mockImplementation(({ inIds, from, to }) => {
      callIdx += 1;
      if (callIdx === 1) {
        expect(from).toBe(0);
        expect(inIds).toEqual(['a', 'b', 'c']);
        const rows: Row[] = [];
        for (let i = 0; i < MESSAGE_PRESENCE_ROW_PAGE; i += 1) {
          rows.push({ conversation_id: i % 2 === 0 ? 'b' : 'c' });
        }
        return Promise.resolve({ data: rows, error: null });
      }
      if (callIdx === 2) {
        expect(from).toBe(0);
        expect(inIds).toEqual(['a']);
        return Promise.resolve({ data: [{ conversation_id: 'a' }], error: null });
      }
      return Promise.resolve({ data: [], error: null });
    });

    const res = await fetchConversationIdsWithAtLeastOneMessage(ids);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect([...res.conversationIds].sort()).toEqual(['a', 'b', 'c']);
    expect(rangeCalls).toHaveBeenCalledTimes(2);
  });

  it('une conv avec >1000 messages : une seule requête suffit (preuve dès la 1re ligne)', async () => {
    const ids = ['only'];
    rangeCalls.mockImplementation(({ inIds, from }) => {
      expect(inIds).toEqual(['only']);
      expect(from).toBe(0);
      const rows: Row[] = Array.from({ length: MESSAGE_PRESENCE_ROW_PAGE }, () => ({
        conversation_id: 'only',
      }));
      return Promise.resolve({ data: rows, error: null });
    });

    const res = await fetchConversationIdsWithAtLeastOneMessage(ids);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.conversationIds.has('only')).toBe(true);
    expect(rangeCalls).toHaveBeenCalledTimes(1);
  });

  it('page vide après une page pleine : filtre inchangé → fin de pagination pour cette conv', async () => {
    rangeCalls.mockImplementation(({ inIds, from }) => {
      expect(inIds).toEqual(['only']);
      if (from === 0) {
        return Promise.resolve({
          data: Array.from({ length: MESSAGE_PRESENCE_ROW_PAGE }, () => ({
            conversation_id: 'only',
          })),
          error: null,
        });
      }
      return Promise.resolve({ data: [], error: null });
    });

    const res = await fetchConversationIdsWithAtLeastOneMessage(['only']);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.conversationIds.has('only')).toBe(true);
  });

  it('propage erreur RLS sans faux positif', async () => {
    rangeCalls.mockResolvedValue({ data: null, error: { message: 'RLS messages' } });
    const res = await fetchConversationIdsWithAtLeastOneMessage(['x']);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errorMessage).toContain('RLS');
  });

  it('early-exit : une seule requête quand toutes les convs ont une ligne dans la première page', async () => {
    rangeCalls.mockResolvedValueOnce({
      data: [
        { conversation_id: 'a' },
        { conversation_id: 'b' },
      ],
      error: null,
    });
    const res = await fetchConversationIdsWithAtLeastOneMessage(['a', 'b']);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect([...res.conversationIds].sort()).toEqual(['a', 'b']);
    expect(rangeCalls).toHaveBeenCalledTimes(1);
  });
});
