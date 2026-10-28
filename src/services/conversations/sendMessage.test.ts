import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sendMessage } from './sendMessage';
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), from: vi.fn(), invoke: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { getUser: mocks.getUser }, from: mocks.from, functions: { invoke: mocks.invoke } } }));
vi.mock('@/lib/analytics', () => ({ trackMessageSendFailed: vi.fn(), trackMessageSent: vi.fn() }));
beforeEach(() => { vi.clearAllMocks(); });
describe('mobile message metadata against the real conversation contract', () => {
  it('persists the last message date using the existing last_message_at column', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'buyer' } }, error: null });
    mocks.invoke.mockResolvedValue({ error: null });
    const row = { id: 'message', conversation_id: 'conversation', sender_id: 'buyer', body: 'Hello', created_at: '2026-10-23T00:00:00Z', read_at: null };
    let persistedDate: string | null = null;
    const update = vi.fn((value: Record<string, string>) => ({ eq: vi.fn(async () => {
      if (Object.keys(value).some(key => key !== 'last_message_at')) return { error: { code: 'PGRST204' } };
      persistedDate = value.last_message_at;
      return { error: null };
    }) }));
    mocks.from.mockImplementation((table: string) => table === 'conversations' ? { update } : {
      insert: () => ({ select: () => ({ single: async () => ({ data: row, error: null }) }) }),
      select: () => ({ eq: async () => ({ count: 1, error: null }) }),
    });
    expect((await sendMessage('conversation', 'Hello')).error).toBeNull();
    expect(persistedDate).not.toBeNull();
    expect(Number.isNaN(Date.parse(persistedDate!))).toBe(false);
  });
});
