import React from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import {
  MarketplaceTabHeader,
  MARKETPLACE_TAB_HEADER_LAYOUT,
  getMarketplaceTabHeaderWrapStyle,
} from './MarketplaceTabHeader';
import { FavoritesScreenHeader } from '@/features/favorites/FavoritesScreenHeader';
import { MessagesScreenHeader } from '@/features/messages/MessagesScreenHeader';

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
vi.mock('@/features/account/accountScreen.constants', () => ({
  MARKETPLACE_TAB_TITLE_PADDING_BOTTOM: 6,
}));
vi.mock('@/theme', () => ({
  spacing: { screenHorizontal: 16, xs: 4 },
  typography: { xl: { fontSize: 20, lineHeight: 28 }, sm: { fontSize: 14, lineHeight: 20 } },
  fontWeights: { bold: '700', semibold: '600' },
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function wrapStyle(tree: ReturnType<typeof create>) {
  const wrap = tree.root.findByType('View' as unknown as React.ComponentType);
  const styles = wrap.props.style as ViewStyleLike[];
  const base = styles.find((s) => s && typeof s === 'object' && 'paddingBottom' in s) as
    | Record<string, unknown>
    | undefined;
  const inset = styles.find((s) => s && typeof s === 'object' && 'paddingTop' in s) as
    | Record<string, unknown>
    | undefined;
  return { base, inset };
}

type ViewStyleLike = Record<string, unknown>;

describe('MarketplaceTabHeader', () => {
  it('exposes shared layout contract', () => {
    expect(MARKETPLACE_TAB_HEADER_LAYOUT.paddingBottom).toBe(6);
    expect(MARKETPLACE_TAB_HEADER_LAYOUT.paddingHorizontal).toBe(16);
    expect(MARKETPLACE_TAB_HEADER_LAYOUT.surface).toBe('#0B4D3C');
    expect(getMarketplaceTabHeaderWrapStyle().paddingBottom).toBe(6);
  });

  it('always renders title and subtitle lines', () => {
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(
        <MarketplaceTabHeader title="Test" subtitle="Ligne deux" subtitleAccessibilityLabel="L2" />
      );
    });
    const texts = tree.root.findAllByType('Text' as unknown as React.ComponentType);
    expect(texts).toHaveLength(2);
    expect(texts[0].props.children).toBe('Test');
    expect(texts[1].props.children).toBe('Ligne deux');
    expect(texts[1].props.numberOfLines).toBe(2);
  });
});

describe('Favorites vs Messages header layout parity', () => {
  it('uses identical wrap padding for zero and non-zero counters', () => {
    let f0!: ReturnType<typeof create>;
    let f3!: ReturnType<typeof create>;
    let m0!: ReturnType<typeof create>;
    let m2!: ReturnType<typeof create>;
    act(() => {
      f0 = create(<FavoritesScreenHeader count={0} />);
      f3 = create(<FavoritesScreenHeader count={3} />);
      m0 = create(<MessagesScreenHeader unreadConversationsCount={0} />);
      m2 = create(<MessagesScreenHeader unreadConversationsCount={2} />);
    });
    const cases = [f0, f3, m0, m2];

    const bases = cases.map((tree) => wrapStyle(tree).base);
    for (const base of bases) {
      expect(base).toEqual(
        expect.objectContaining({
          backgroundColor: '#0B4D3C',
          paddingBottom: 6,
          paddingHorizontal: 16,
        })
      );
    }

    const insetTops = cases.map((tree) => wrapStyle(tree).inset?.paddingTop);
    expect(new Set(insetTops)).toEqual(new Set([46]));
  });

  it('keeps subtitle slot when favorites count is zero', () => {
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(<FavoritesScreenHeader count={0} />);
    });
    const texts = tree.root.findAllByType('Text' as unknown as React.ComponentType);
    expect(texts).toHaveLength(2);
    expect(texts[1].props.children).toBe('0 annonce');
  });

  it('keeps subtitle slot when messages unread count is zero', () => {
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(<MessagesScreenHeader unreadConversationsCount={0} />);
    });
    const texts = tree.root.findAllByType('Text' as unknown as React.ComponentType);
    expect(texts).toHaveLength(2);
    expect(texts[1].props.children).toBe('Aucune conversation non lue');
  });
});
