import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./messagesDemoImages', () => ({
  messagesDemoImageUri: (key: string) => `https://demo.local/${key}`,
}));

const alertSpy = vi.fn();

vi.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  FlatList: 'FlatList',
  Modal: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
    visible ? children : null,
  StyleSheet: { create: (s: unknown) => s, hairlineWidth: 1 },
  Alert: {
    alert: (...args: unknown[]) => {
      alertSpy(...args);
      const buttons = args[2] as { text?: string; style?: string; onPress?: () => void }[] | undefined;
      buttons?.find((b) => b.style === 'destructive')?.onPress?.();
    },
  },
}));

vi.mock('@/components', () => ({
  Screen: ({ children }: { children: React.ReactNode }) => React.createElement('Screen', null, children),
}));

vi.mock('@/features/messages/MessagesScreenHeader', () => ({
  MessagesScreenHeader: 'MessagesScreenHeader',
}));

vi.mock('@/features/messages/InboxConversationRow', () => ({
  InboxConversationRow: 'InboxConversationRow',
}));

vi.mock('@/features/messages/SwipeToDeleteRow', () => ({
  SwipeToDeleteRow: ({
    children,
    onDeletePress,
  }: {
    children: React.ReactNode;
    onDeletePress: () => void;
  }) => React.createElement('SwipeRow', { onDeletePress }, children),
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
import { MESSAGE_DEMO_CONVERSATION_COUNT } from './messagesDemoFixtures';

function flatList(r: ReactTestRenderer) {
  return r.root.findByType('FlatList' as never);
}

function flatListData(r: ReactTestRenderer): ConversationRow[] {
  return flatList(r).props.data as ConversationRow[];
}

function flatListEpoch(r: ReactTestRenderer): number {
  return flatList(r).props.extraData as number;
}

function triggerDeleteAt(r: ReactTestRenderer, index: number) {
  const list = flatList(r);
  const item = list.props.data[index] as ConversationRow;
  const element = list.props.renderItem({ item, index, separators: {} as never });
  act(() => {
    element.props.onDeletePress();
  });
}

type ConversationRow = { id: string };

function listHeaderProps(r: ReactTestRenderer) {
  return (flatList(r).props.ListHeaderComponent as React.ReactElement<{
    onToggleDevPanel: () => void;
    onReset: () => void;
  }>).props;
}

function openPanelAndReset(r: ReactTestRenderer) {
  const header = listHeaderProps(r);
  act(() => {
    header.onToggleDevPanel();
  });
  const headerOpen = listHeaderProps(r);
  act(() => {
    headerOpen.onReset();
  });
}

describe('MessagesDemoScreen — réinitialisation locale', () => {
  beforeEach(() => {
    alertSpy.mockClear();
  });

  it('supprime une ligne puis restaure exactement 8 conversations via le bouton Reset', () => {
    let r!: ReactTestRenderer;
    act(() => {
      r = create(<MessagesDemoScreen onExit={vi.fn()} />);
    });

    expect(flatListData(r)).toHaveLength(MESSAGE_DEMO_CONVERSATION_COUNT);

    triggerDeleteAt(r, 0);
    expect(alertSpy).toHaveBeenCalled();
    expect(flatListData(r)).toHaveLength(MESSAGE_DEMO_CONVERSATION_COUNT - 1);

    openPanelAndReset(r);

    expect(flatListData(r)).toHaveLength(MESSAGE_DEMO_CONVERSATION_COUNT);
    const ids = flatListData(r).map((c) => c.id);
    expect(new Set(ids).size).toBe(MESSAGE_DEMO_CONVERSATION_COUNT);
    expect(ids.every((id) => id.startsWith('msg-demo-'))).toBe(true);
    expect(flatListEpoch(r)).toBe(1);
  });

  it('referme le swipe (openRowId) lors de la réinitialisation', () => {
    let r!: ReactTestRenderer;
    act(() => {
      r = create(<MessagesDemoScreen onExit={vi.fn()} />);
    });
    triggerDeleteAt(r, 0);
    openPanelAndReset(r);
    expect(flatListData(r)).toHaveLength(MESSAGE_DEMO_CONVERSATION_COUNT);
    expect(flatList(r).props.extraData).toBeGreaterThan(0);
  });
});
