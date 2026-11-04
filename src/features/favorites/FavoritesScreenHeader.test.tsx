import React from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { FavoritesScreenHeader } from './FavoritesScreenHeader';

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
  spacing: { screenHorizontal: 16, md: 12, xs: 4 },
  typography: { xl: {}, sm: {} },
  fontWeights: { bold: '700', semibold: '600' },
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('FavoritesScreenHeader', () => {
  it('shows the real counter when listings are visible', () => {
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(<FavoritesScreenHeader count={3} />);
    });
    const label = (node: { props: { children?: unknown } }) =>
      Array.isArray(node.props.children)
        ? node.props.children.join('')
        : String(node.props.children ?? '');
    const texts = tree.root.findAllByType('Text' as unknown as React.ComponentType);
    expect(texts.some((node) => label(node).includes('Favoris'))).toBe(true);
    expect(texts.some((node) => label(node).includes('3 annonces'))).toBe(true);
  });

  it('hides the counter line when count is zero', () => {
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(<FavoritesScreenHeader count={0} />);
    });
    const texts = tree.root.findAllByType('Text' as unknown as React.ComponentType);
    expect(texts).toHaveLength(1);
  });
});
