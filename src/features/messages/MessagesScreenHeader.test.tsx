import React from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { MessagesScreenHeader, messagesSubtitle } from './MessagesScreenHeader';

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
vi.mock('@/components/MarketplaceTabHeader', () => ({
  MarketplaceTabHeader: ({
    title,
    subtitle,
    subtitleAccessibilityLabel,
  }: {
    title: string;
    subtitle: string;
    subtitleAccessibilityLabel?: string;
  }) =>
    React.createElement('MarketplaceTabHeader', { title, subtitle, subtitleAccessibilityLabel }),
  MARKETPLACE_TAB_SURFACE: '#0B4D3C',
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('MessagesScreenHeader', () => {
  it('shows unread conversations subtitle when count > 0', () => {
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(<MessagesScreenHeader unreadConversationsCount={2} />);
    });
    const header = tree.root.findByType('MarketplaceTabHeader' as unknown as React.ComponentType);
    expect(header.props.title).toBe('Messages');
    expect(header.props.subtitle).toBe('2 conversations non lues');
  });

  it('reserves subtitle line when zero unread conversations', () => {
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(<MessagesScreenHeader unreadConversationsCount={0} />);
    });
    const header = tree.root.findByType('MarketplaceTabHeader' as unknown as React.ComponentType);
    expect(header.props.subtitle).toBe('Aucune conversation non lue');
    expect(header.props.subtitleAccessibilityLabel).toBe('Aucune conversation non lue');
  });

  it('uses singular copy for one unread conversation', () => {
    expect(messagesSubtitle(1)).toBe('1 conversation non lue');
  });
});
