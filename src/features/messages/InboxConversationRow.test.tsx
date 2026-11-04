import React from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import type { Conversation } from '@/services/conversations/types';
import { InboxConversationRow } from './InboxConversationRow';

vi.mock('react-native-reanimated', () => ({
  default: { View: 'Animated.View' },
  useSharedValue: (v: number) => ({ value: v }),
  useAnimatedStyle: (fn: () => object) => fn(),
  withTiming: (v: number) => v,
  withSpring: (v: number) => v,
  Easing: { out: () => ({}), quad: {} },
}));

vi.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

vi.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  Pressable: 'Pressable',
  StyleSheet: { create: (s: unknown) => s, hairlineWidth: 1 },
}));

vi.mock('@/theme', () => ({
  spacing: { base: 16, md: 12, sm: 8 },
  colors: {
    surface: '#fff',
    surfaceSubtle: '#f5f5f5',
    text: '#111',
    textSecondary: '#666',
    textTertiary: '#999',
    textMuted: '#aaa',
    primary: '#0a0',
  },
  typography: { sm: {}, xs: {} },
  fontWeights: { bold: '700', semibold: '600', medium: '500' },
  radius: { lg: 12, sm: 4 },
}));

vi.mock('./inboxDisplay', () => ({
  formatInboxDate: () => '14:30',
  INBOX_LISTING_THUMB_SIZE: 72,
}));

vi.mock('./InboxListingThumb', () => ({
  InboxListingThumb: 'InboxListingThumb',
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function conv(partial: Partial<Conversation> & Pick<Conversation, 'id'>): Conversation {
  return {
    listing_id: 'l1',
    buyer_id: 'b',
    seller_id: 's',
    created_at: '2026-11-01T10:00:00.000Z',
    updated_at: '2026-11-01T10:00:00.000Z',
    listing_title: 'Titre annonce',
    other_party_name: 'Marie Dupont',
    last_message_preview: 'Dernier message',
    last_message_at: '2026-11-04T12:00:00.000Z',
    unread_count: 0,
    ...partial,
  };
}

describe('InboxConversationRow', () => {
  it('renders listing title before participant in accessibility label', () => {
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(
        <InboxConversationRow item={conv({ id: 'c1' })} onPress={() => {}} />
      );
    });
    const pressable = tree.root.findByType('Pressable' as unknown as React.ComponentType);
    expect(String(pressable.props.accessibilityLabel)).toContain('Titre annonce');
    expect(String(pressable.props.accessibilityLabel)).toContain('Marie Dupont');
  });

  it('shows badge only when unread_count > 0', () => {
    let treeUnread!: ReturnType<typeof create>;
    act(() => {
      treeUnread = create(
        <InboxConversationRow item={conv({ id: 'c2', unread_count: 3 })} onPress={() => {}} />
      );
    });
    const textsUnread = treeUnread.root.findAllByType('Text' as unknown as React.ComponentType);
    expect(textsUnread.some((n) => String(n.props.children) === '3')).toBe(true);

    let treeRead!: ReturnType<typeof create>;
    act(() => {
      treeRead = create(
        <InboxConversationRow item={conv({ id: 'c3', unread_count: 0 })} onPress={() => {}} />
      );
    });
    const textsRead = treeRead.root.findAllByType('Text' as unknown as React.ComponentType);
    expect(textsRead.some((n) => String(n.props.children) === '3')).toBe(false);
  });

  it('uses Annonce supprimée when listing title missing', () => {
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(
        <InboxConversationRow
          item={conv({ id: 'c4', listing_title: undefined })}
          onPress={() => {}}
        />
      );
    });
    const label = (node: { props: { children?: unknown } }) =>
      Array.isArray(node.props.children)
        ? node.props.children.join('')
        : String(node.props.children ?? '');
    const texts = tree.root.findAllByType('Text' as unknown as React.ComponentType);
    expect(texts.some((n) => label(n).includes('Annonce supprimée'))).toBe(true);
  });

  it('calls onPress when row pressed', () => {
    const onPress = vi.fn();
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(<InboxConversationRow item={conv({ id: 'c5' })} onPress={onPress} />);
    });
    const pressable = tree.root.findByType('Pressable' as unknown as React.ComponentType);
    act(() => {
      pressable.props.onPress();
    });
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('caps badge at 9+', () => {
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(
        <InboxConversationRow item={conv({ id: 'c6', unread_count: 12 })} onPress={() => {}} />
      );
    });
    const texts = tree.root.findAllByType('Text' as unknown as React.ComponentType);
    expect(texts.some((n) => String(n.props.children) === '9+')).toBe(true);
  });

  it('limite le titre annonce à deux lignes tout en gardant le libellé complet en accessibilité', () => {
    const longTitle =
      'Ordinateur portable professionnel 15 pouces — SSD 512 Go, 16 Go RAM, garantie constructeur';
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(
        <InboxConversationRow
          item={conv({ id: 'c7', listing_title: longTitle })}
          onPress={() => {}}
        />
      );
    });
    const texts = tree.root.findAllByType('Text' as unknown as React.ComponentType);
    const titleNode = texts.find((n) => String(n.props.children) === longTitle);
    expect(titleNode?.props.numberOfLines).toBe(2);
    expect(titleNode?.props.ellipsizeMode).toBe('tail');
    const pressable = tree.root.findByType('Pressable' as unknown as React.ComponentType);
    expect(String(pressable.props.accessibilityLabel)).toContain(longTitle);
  });

  it('expose une zone tactile confortable (hitSlop + état pressé)', () => {
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(<InboxConversationRow item={conv({ id: 'c8' })} onPress={() => {}} />);
    });
    const pressable = tree.root.findByType('Pressable' as unknown as React.ComponentType);
    expect(pressable.props.hitSlop).toBe(8);
    expect(typeof pressable.props.style).toBe('function');
  });
});
