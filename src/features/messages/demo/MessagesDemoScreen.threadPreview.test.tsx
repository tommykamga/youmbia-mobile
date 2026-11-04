import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./messagesDemoImages', () => ({
  messagesDemoImageUri: (key: string) => `https://demo.local/${key}`,
}));

const threadPreviewSpy = vi.fn();

vi.mock('./ConversationThreadDemoScreen', () => ({
  ConversationThreadDemoScreen: (props: {
    conversation: { id: string };
    onClose: () => void;
  }) => {
    threadPreviewSpy(props);
    return React.createElement('ThreadPreview', {
      onClose: props.onClose,
      conversationId: props.conversation.id,
    });
  },
}));

vi.mock('./useDemoThreadTabBarHidden', () => ({
  useDemoThreadTabBarHidden: vi.fn(),
}));

vi.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  Pressable: 'Pressable',
  FlatList: 'FlatList',
  StyleSheet: { create: (s: unknown) => s, hairlineWidth: 1 },
  Alert: { alert: vi.fn() },
}));

vi.mock('@/components', () => ({
  Screen: ({ children }: { children: React.ReactNode }) => React.createElement('Screen', null, children),
}));

vi.mock('@/features/messages/MessagesScreenHeader', () => ({
  MessagesScreenHeader: 'MessagesScreenHeader',
}));

vi.mock('@/features/messages/InboxConversationRow', () => ({
  InboxConversationRow: ({ onPress }: { onPress?: () => void }) =>
    React.createElement('Pressable', { onPress, testID: 'demo-inbox-row' }),
}));

vi.mock('@/features/messages/SwipeToDeleteRow', () => ({
  SwipeToDeleteRow: ({ children }: { children: React.ReactNode }) =>
    React.createElement('SwipeRow', null, children),
}));

vi.mock('@/theme', () => ({
  spacing: {
    base: 16,
    sm: 8,
    md: 12,
    lg: 20,
    screenHorizontal: 16,
    '3xl': 48,
  },
  colors: {
    surface: '#fff',
    borderLight: '#eee',
    text: '#111',
    textSecondary: '#666',
  },
  typography: { sm: {}, base: {}, lg: {} },
  fontWeights: { semibold: '600', bold: '700' },
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { MessagesDemoScreen } from './MessagesDemoScreen';

function flatList(r: ReactTestRenderer) {
  return r.root.findByType('FlatList' as never);
}

function openFirstConversation(r: ReactTestRenderer) {
  const list = flatList(r);
  const item = list.props.data[0];
  const row = list.props.renderItem({ item, index: 0, separators: {} as never });
  const pressable = row.props.children;
  act(() => {
    pressable.props.onPress();
  });
}

describe('MessagesDemoScreen — chemin fil premium démo', () => {
  it('inbox démo → tap conversation → fil preview → retour inbox', () => {
    threadPreviewSpy.mockClear();
    let r!: ReactTestRenderer;
    act(() => {
      r = create(<MessagesDemoScreen onExit={vi.fn()} />);
    });

    expect(() => r.root.findByType('FlatList' as never)).not.toThrow();
    expect(() => r.root.findByType('ThreadPreview' as never)).toThrow();

    openFirstConversation(r);

    expect(threadPreviewSpy).toHaveBeenCalledTimes(1);
    expect(threadPreviewSpy.mock.calls[0][0].conversation.id).toMatch(/^msg-demo-conv-/);
    expect(() => r.root.findByType('ThreadPreview' as never)).not.toThrow();
    expect(() => r.root.findByType('FlatList' as never)).toThrow();

    const thread = r.root.findByType('ThreadPreview' as never);
    act(() => {
      thread.props.onClose();
    });

    expect(() => r.root.findByType('FlatList' as never)).not.toThrow();
    expect(() => r.root.findByType('ThreadPreview' as never)).toThrow();
  });
});
