import React from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { FavoritesScreenHeader, favoritesSubtitle } from './FavoritesScreenHeader';

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

describe('FavoritesScreenHeader', () => {
  it('shows the real counter when listings are visible', () => {
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(<FavoritesScreenHeader count={3} />);
    });
    const header = tree.root.findByType('MarketplaceTabHeader' as unknown as React.ComponentType);
    expect(header.props.title).toBe('Favoris');
    expect(header.props.subtitle).toBe('3 annonces');
  });

  it('reserves subtitle line when count is zero', () => {
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(<FavoritesScreenHeader count={0} />);
    });
    const header = tree.root.findByType('MarketplaceTabHeader' as unknown as React.ComponentType);
    expect(header.props.subtitle).toBe('0 annonce');
    expect(header.props.subtitleAccessibilityLabel).toBe('0 annonces');
  });

  it('formats subtitle copy', () => {
    expect(favoritesSubtitle(1)).toBe('1 annonce');
    expect(favoritesSubtitle(2)).toBe('2 annonces');
  });
});
