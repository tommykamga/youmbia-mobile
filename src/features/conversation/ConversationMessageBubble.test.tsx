import React from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { ConversationMessageBubble } from './ConversationMessageBubble';

vi.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  StyleSheet: { create: (s: unknown) => s },
}));

vi.mock('@/theme', () => ({
  spacing: { xs: 4, sm: 8, md: 12 },
  colors: {
    text: '#111',
    textMuted: '#999',
    textTertiary: '#aaa',
    surface: '#fff',
    borderLight: '#eee',
    primary: '#0a0',
    primaryDark: '#080',
    primaryLight: '#efe',
  },
  typography: { base: {}, xs: {} },
  fontWeights: { semibold: '600', bold: '700' },
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const message = {
  id: 'm1',
  conversation_id: 'c1',
  sender_id: 'u1',
  body: 'Bonjour, le canapé est-il toujours disponible ? Je peux passer demain matin si vous êtes disponible pour une visite rapide.',
  created_at: '2026-11-04T14:00:00.000Z',
  read_at: null as string | null,
};

describe('ConversationMessageBubble', () => {
  it('affiche le corps intégral du message', () => {
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(
        <ConversationMessageBubble
          message={message}
          isMe={false}
          showReadStatus={false}
          extraTopMargin={false}
        />
      );
    });
    const texts = tree.root.findAllByType('Text' as never);
    expect(texts.some((n) => String(n.props.children) === message.body)).toBe(true);
  });

  it('affiche Lu sous le dernier message envoyé', () => {
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(
        <ConversationMessageBubble
          message={{ ...message, read_at: '2026-11-04T15:00:00.000Z' }}
          isMe
          showReadStatus
          extraTopMargin={false}
        />
      );
    });
    const texts = tree.root.findAllByType('Text' as never);
    expect(texts.some((n) => String(n.props.children) === 'Lu')).toBe(true);
  });

  it('affiche un séparateur de jour', () => {
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(
        <ConversationMessageBubble
          message={message}
          isMe={false}
          showReadStatus={false}
          daySeparatorLabel="Aujourd'hui"
          extraTopMargin={false}
        />
      );
    });
    const texts = tree.root.findAllByType('Text' as never);
    expect(texts.some((n) => String(n.props.children) === "Aujourd'hui")).toBe(true);
  });
});
