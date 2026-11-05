import { describe, expect, it, vi } from 'vitest';

vi.mock('./messagesDemoImages', () => ({
  messagesDemoImageUri: (key: string) => `https://demo.local/${key}`,
}));

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  createDemoThreadMessages,
  createLocalDemoSentMessage,
  DEMO_THREAD_VIEWER_ID,
  getDemoThreadListingPriceLabel,
} from './messagesThreadDemoFixtures';
import { MESSAGE_DEMO_CONVERSATION_COUNT, createMessagesDemoSnapshot } from './messagesDemoFixtures';

function read(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8');
}

describe('messagesThreadDemoFixtures', () => {
  it('fournit des messages pour chaque conversation inbox démo', () => {
    const { conversations } = createMessagesDemoSnapshot();
    expect(conversations).toHaveLength(MESSAGE_DEMO_CONVERSATION_COUNT);
    for (const c of conversations) {
      const msgs = createDemoThreadMessages(c.id);
      expect(msgs.every((m) => m.conversation_id === c.id)).toBe(true);
      expect(msgs.every((m) => m.id.startsWith('msg-demo-'))).toBe(true);
    }
  });

  it('couvre fil vide, multiligne, dates et FCFA', () => {
    expect(createDemoThreadMessages('msg-demo-conv-05')).toHaveLength(0);
    const long = createDemoThreadMessages('msg-demo-conv-06')[0];
    expect(long.body).toContain('\n');
    const conv01 = createDemoThreadMessages('msg-demo-conv-01');
    expect(conv01.some((m) => m.sender_id === DEMO_THREAD_VIEWER_ID)).toBe(true);
    expect(conv01.some((m) => m.sender_id !== DEMO_THREAD_VIEWER_ID)).toBe(true);
    expect(getDemoThreadListingPriceLabel('msg-demo-listing-04')).toMatch(/385/);
    expect(getDemoThreadListingPriceLabel('msg-demo-listing-08')).toBeNull();
  });

  it('envoi local reste en mémoire avec identifiant démo', () => {
    const sent = createLocalDemoSentMessage('msg-demo-conv-01', 'Test local');
    expect(sent.sender_id).toBe(DEMO_THREAD_VIEWER_ID);
    expect(sent.id).toMatch(/^msg-demo-local-/);
    expect(sent.read_at).toBeNull();
  });
});

describe('ConversationThreadDemoScreen — isolation', () => {
  it('n’importe pas les services conversation Supabase', () => {
    const src = read('src/features/messages/demo/ConversationThreadDemoScreen.tsx');
    expect(src).not.toMatch(/sendMessage/);
    expect(src).not.toMatch(/getMessages/);
    expect(src).not.toMatch(/markConversationRead/);
    expect(src).not.toMatch(/subscribeMessagingEvents/);
    expect(src).not.toMatch(/useConversationListingPresentation/);
    expect(src).not.toMatch(/router\.push/);
    expect(src).toMatch(/createLocalDemoSentMessage/);
    expect(src).toMatch(/ConversationHeader/);
    expect(src).toMatch(/ConversationMessageBubble/);
  });
});

describe('MessagesDemoScreen — fil démo', () => {
  it('monte la prévisualisation fil sans router /conversation', () => {
    const src = read('src/features/messages/demo/MessagesDemoScreen.tsx');
    expect(src).toMatch(/ConversationThreadDemoScreen/);
    expect(src).not.toMatch(/\bModal\b/);
    expect(src).not.toMatch(/router\.push\(`\/conversation\//);
    expect(src).not.toMatch(/MESSAGE_DEMO_PREVIEW_BODY/);
  });
});
