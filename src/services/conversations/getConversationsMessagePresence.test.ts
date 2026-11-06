import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fetchConversationIdsWithAtLeastOneMessage } from './getConversationsMessagePresence';

type Row = { conversation_id: string };

const responseQueue: { data: Row[] | null; error: { message: string } | null }[] = [];

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: () => ({
        in: () => ({
          range: (_from: number, _to: number) =>
            Promise.resolve(responseQueue.shift() ?? { data: [], error: null }),
        }),
      }),
    })),
  },
}));

describe('fetchConversationIdsWithAtLeastOneMessage', () => {
  beforeEach(() => {
    responseQueue.length = 0;
    vi.clearAllMocks();
  });

  it('early-exit : arrête de paginer quand toutes les conversations du lot ont une ligne', async () => {
    const ids = ['a', 'b', 'c'];
    responseQueue.push({
      data: [
        { conversation_id: 'a' },
        { conversation_id: 'b' },
        { conversation_id: 'c' },
      ],
      error: null,
    });

    const res = await fetchConversationIdsWithAtLeastOneMessage(ids);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect([...res.conversationIds].sort()).toEqual(['a', 'b', 'c']);
    expect(responseQueue.length).toBe(0);
  });

  it('propage une erreur Supabase sans faux positif', async () => {
    responseQueue.push({ data: null, error: { message: 'RLS messages' } });
    const res = await fetchConversationIdsWithAtLeastOneMessage(['x']);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errorMessage).toContain('RLS');
  });
});
