import React from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { MessagesScreenHeader } from './MessagesScreenHeader';

vi.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  StyleSheet: { create: (s: unknown) => s },
}));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 0, left: 0, right: 0 }),
}));
vi.mock('@/context/AppUpdateBannerInsetContext', () => ({
  useAppUpdateBannerInset: () => 0,
}));
vi.mock('@/theme', () => ({
  spacing: { screenHorizontal: 16, xs: 4 },
  typography: { xl: {}, sm: {} },
  fontWeights: { bold: '700', semibold: '600' },
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('MessagesScreenHeader', () => {
  it('shows unread conversations subtitle when count > 0', () => {
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(<MessagesScreenHeader unreadConversationsCount={2} />);
    });
    const label = (node: { props: { children?: unknown } }) =>
      Array.isArray(node.props.children)
        ? node.props.children.join('')
        : String(node.props.children ?? '');
    const texts = tree.root.findAllByType('Text' as unknown as React.ComponentType);
    expect(texts.some((n) => label(n).includes('Messages'))).toBe(true);
    expect(texts.some((n) => label(n).includes('2 conversations non lues'))).toBe(true);
  });

  it('hides subtitle when zero unread conversations', () => {
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(<MessagesScreenHeader unreadConversationsCount={0} />);
    });
    const texts = tree.root.findAllByType('Text' as unknown as React.ComponentType);
    expect(texts).toHaveLength(1);
  });

  it('uses singular copy for one unread conversation', () => {
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(<MessagesScreenHeader unreadConversationsCount={1} />);
    });
    const label = (node: { props: { children?: unknown } }) =>
      Array.isArray(node.props.children)
        ? node.props.children.join('')
        : String(node.props.children ?? '');
    const texts = tree.root.findAllByType('Text' as unknown as React.ComponentType);
    expect(texts.some((n) => label(n).includes('1 conversation non lue'))).toBe(true);
  });
});
