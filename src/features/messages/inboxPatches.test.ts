import { describe, expect, it } from 'vitest';
import type { Conversation, Message } from '@/services/conversations/types';
import {
  patchInboxOnIncoming,
  patchInboxOnRead,
  sortConversationsInbox,
} from './inboxPatches';

const USER = 'user-a';
const OTHER = 'user-b';
const CONV = 'conv-1';

function baseConv(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: CONV,
    listing_id: 'listing-1',
    buyer_id: USER,
    seller_id: OTHER,
    created_at: '2026-11-01T10:00:00.000Z',
    updated_at: '2026-11-01T10:00:00.000Z',
    last_message_at: '2026-11-01T10:00:00.000Z',
    unread_count: 0,
    ...overrides,
  };
}

describe('inboxPatches — comportement inchangé Phase A', () => {
  it('sortConversationsInbox orders by last activity desc', () => {
    const list = [
      baseConv({ id: 'a', last_message_at: '2026-11-01T10:00:00.000Z' }),
      baseConv({ id: 'b', last_message_at: '2026-11-03T10:00:00.000Z' }),
    ];
    sortConversationsInbox(list);
    expect(list.map((c) => c.id)).toEqual(['b', 'a']);
  });

  it('patchInboxOnIncoming increments unread for other sender only', () => {
    const list = [baseConv({ unread_count: 1 })];
    const msg: Message = {
      id: 'm1',
      conversation_id: CONV,
      sender_id: OTHER,
      body: 'Bonjour',
      created_at: '2026-11-04T12:00:00.000Z',
      read_at: null,
    };
    const next = patchInboxOnIncoming(list, msg, USER);
    expect(next).not.toBe('refetch');
    if (next === 'refetch') return;
    expect(next[0].unread_count).toBe(2);
    expect(next[0].last_message_preview).toBe('Bonjour');
  });

  it('patchInboxOnIncoming does not increment for self', () => {
    const list = [baseConv({ unread_count: 0 })];
    const msg: Message = {
      id: 'm2',
      conversation_id: CONV,
      sender_id: USER,
      body: 'Ma réponse',
      created_at: '2026-11-04T12:00:00.000Z',
      read_at: null,
    };
    const next = patchInboxOnIncoming(list, msg, USER);
    if (next === 'refetch') throw new Error('unexpected refetch');
    expect(next[0].unread_count).toBe(0);
  });

  it('patchInboxOnIncoming returns refetch for unknown conversation', () => {
    const list = [baseConv({ id: 'other' })];
    const msg: Message = {
      id: 'm3',
      conversation_id: CONV,
      sender_id: OTHER,
      body: 'Hi',
      created_at: '2026-11-04T12:00:00.000Z',
      read_at: null,
    };
    expect(patchInboxOnIncoming(list, msg, USER)).toBe('refetch');
  });

  it('patchInboxOnRead clears unread_count', () => {
    const list = [baseConv({ unread_count: 5 }), baseConv({ id: 'x', unread_count: 2 })];
    const next = patchInboxOnRead(list, CONV);
    expect(next[0].unread_count).toBe(0);
    expect(next[1].unread_count).toBe(2);
  });
});
