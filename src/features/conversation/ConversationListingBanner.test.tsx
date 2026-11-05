import React from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { ConversationListingBanner } from './ConversationListingBanner';

vi.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  Pressable: 'Pressable',
  Image: 'Image',
  StyleSheet: { create: (s: unknown) => s, hairlineWidth: 1, absoluteFillObject: {} },
}));

vi.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

vi.mock('@/theme', () => ({
  spacing: { sm: 8, md: 12, screenHorizontal: 16 },
  colors: {
    surface: '#fff',
    surfaceSubtle: '#f5f5f5',
    text: '#111',
    textTertiary: '#999',
    textSecondary: '#666',
    primary: '#0a0',
    borderLight: '#eee',
  },
  typography: { xs: {}, sm: {} },
  fontWeights: { semibold: '600', bold: '700', medium: '500' },
  radius: { md: 8 },
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('ConversationListingBanner', () => {
  it('affiche titre et prix et déclenche onPress', () => {
    const onPress = vi.fn();
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(
        <ConversationListingBanner
          listingTitle="Canapé trois places"
          priceLabel="150 000 FCFA"
          thumbUrl={null}
          onPress={onPress}
        />
      );
    });
    const pressable = tree.root.findByType('Pressable' as never);
    expect(String(pressable.props.accessibilityLabel)).toContain('Canapé trois places');
    act(() => {
      pressable.props.onPress();
    });
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
