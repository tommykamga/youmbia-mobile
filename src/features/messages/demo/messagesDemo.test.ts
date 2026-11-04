import { describe, expect, it, vi } from 'vitest';

vi.mock('./messagesDemoImages', () => ({
  messagesDemoImageUri: (key: string) => `https://demo.local/${key}`,
}));

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isMessagesDemoEnabled } from './messagesDemo';
import {
  MESSAGE_DEMO_CONVERSATION_COUNT,
  createMessagesDemoSnapshot,
} from './messagesDemoFixtures';
import { countUnreadConversations } from '@/features/messages/inboxDisplay';

function read(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8');
}

describe('isMessagesDemoEnabled', () => {
  it('refuse la production même avec drapeau', () => {
    expect(isMessagesDemoEnabled(false, '1')).toBe(false);
    expect(isMessagesDemoEnabled(false, undefined)).toBe(false);
  });

  it('exige __DEV__ et EXPO_PUBLIC_MESSAGES_DEMO=1', () => {
    expect(isMessagesDemoEnabled(true, undefined)).toBe(false);
    expect(isMessagesDemoEnabled(true, '0')).toBe(false);
    expect(isMessagesDemoEnabled(true, '1')).toBe(true);
  });
});

describe('messagesDemoFixtures', () => {
  it('expose 8 conversations distinctes', () => {
    const { conversations } = createMessagesDemoSnapshot();
    expect(conversations).toHaveLength(MESSAGE_DEMO_CONVERSATION_COUNT);
    expect(MESSAGE_DEMO_CONVERSATION_COUNT).toBe(8);
    const ids = new Set(conversations.map((c) => c.id));
    expect(ids.size).toBe(8);
    expect([...ids].every((id) => id.startsWith('msg-demo-'))).toBe(true);
  });

  it('couvre non-lus, sans photo et titre supprimé', () => {
    const { conversations, thumbByListingId } = createMessagesDemoSnapshot();
    expect(conversations.some((c) => (c.unread_count ?? 0) > 1)).toBe(true);
    expect(conversations.some((c) => (c.unread_count ?? 0) === 0)).toBe(true);
    expect(thumbByListingId['msg-demo-listing-05']).toBeUndefined();
    expect(thumbByListingId['msg-demo-listing-01']).toContain('phone_01');
    expect(conversations.find((c) => c.id === 'msg-demo-conv-08')?.listing_title).toBeUndefined();
  });

  it('alimente le sous-titre header (conversations non lues, pas messages)', () => {
    const { conversations } = createMessagesDemoSnapshot();
    expect(countUnreadConversations(conversations)).toBe(2);
  });

  it('inclut un titre volontairement long pour la recette deux lignes', () => {
    const { conversations } = createMessagesDemoSnapshot();
    const long = conversations.find((c) => c.id === 'msg-demo-conv-04');
    expect(long?.listing_title?.length).toBeGreaterThan(60);
  });
});

describe('MessagesDemoScreen — isolation', () => {
  it('n’appelle pas les services messages Supabase', () => {
    const src = read('src/features/messages/demo/MessagesDemoScreen.tsx');
    expect(src).not.toMatch(/getConversations/);
    expect(src).not.toMatch(/hideConversationForMe/);
    expect(src).not.toMatch(/subscribeMessagingEvents/);
    expect(src).not.toMatch(/emitConversationRead/);
    expect(src).not.toMatch(/lightCacheWrite/);
    expect(src).not.toMatch(/router\.push\(`\/conversation\//);
  });

  it('réinitialise et masque en mémoire locale uniquement', () => {
    const src = read('src/features/messages/demo/MessagesDemoScreen.tsx');
    expect(src).toMatch(/createMessagesDemoSnapshot/);
    expect(src).toMatch(/setConversations\(\(prev\) => prev\.filter/);
    expect(src).toMatch(/setListEpoch/);
    expect(src).toMatch(/messages-demo-list-/);
    expect(src).not.toMatch(/hideConversationForMe/);
  });
});

describe('MessagesInboxScreen — démo optionnelle', () => {
  it('ne monte la démo que via le routeur messages', () => {
    const tab = read('app/(tabs)/messages.tsx');
    expect(tab).toMatch(/MessagesDemoScreen/);
    expect(tab).toMatch(/isMessagesDemoEnabled/);
    expect(tab).toMatch(/setDemoActive\(false\)/);
  });

  it('inbox connectée : entrée démo seulement si onRequestDemo fourni', () => {
    const inbox = read('src/features/messages/MessagesInboxScreen.tsx');
    expect(inbox).toMatch(/onRequestDemo \? <MessagesInboxDemoEntry/);
    expect(inbox).not.toMatch(/MessagesDemoScreen/);
  });
});

describe('production — démo inaccessible', () => {
  it('route Messages : garde __DEV__ sur rendu et activation', () => {
    const tab = read('app/(tabs)/messages.tsx');
    expect(tab).toMatch(/if\s*\(\s*__DEV__\s*&&\s*demoActive\s*\)/);
    expect(tab).toMatch(/onRequestDemo=\{__DEV__ \? \(\) => setDemoActive\(true\) : undefined\}/);
  });

  it('isMessagesDemoEnabled refuse tout build non développement', () => {
    expect(isMessagesDemoEnabled(false, '1')).toBe(false);
  });
});
