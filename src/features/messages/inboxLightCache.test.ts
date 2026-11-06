import { describe, expect, it } from 'vitest';
import { INBOX_LIGHT_CACHE_SCHEMA, isInboxLightCacheTrusted, type InboxCachePayload } from './inboxLightCache';
import type { Conversation } from '@/services/conversations/types';

const sampleConv = {
  id: 'c1',
  listing_id: 'l1',
  buyer_id: 'b1',
  seller_id: 's1',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
} satisfies Conversation;

describe('inboxLightCache — schéma et confiance', () => {
  it('considère non fiable un cache sans inboxSchema (compte différent du schéma actuel)', () => {
    const legacy: InboxCachePayload = { userId: 'u1', conversations: [sampleConv] };
    expect(isInboxLightCacheTrusted(legacy)).toBe(false);
  });

  it('fait confiance au cache avec inboxSchema courant', () => {
    const cur: InboxCachePayload = {
      userId: 'u1',
      conversations: [sampleConv],
      inboxSchema: INBOX_LIGHT_CACHE_SCHEMA,
    };
    expect(isInboxLightCacheTrusted(cur)).toBe(true);
  });

  it('refuse un schéma inbox obsolète', () => {
    const old: InboxCachePayload = {
      userId: 'u1',
      conversations: [sampleConv],
      inboxSchema: INBOX_LIGHT_CACHE_SCHEMA - 1,
    };
    expect(isInboxLightCacheTrusted(old)).toBe(false);
  });
});
