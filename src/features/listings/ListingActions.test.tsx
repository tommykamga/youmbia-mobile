import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { ListingActions } from './ListingActions';
import type { ListingDetail } from '@/services/listings';

vi.mock('react-native', () => ({
  Platform: { OS: 'ios', select: (options: { ios?: unknown; default?: unknown }) => options.ios ?? options.default },
  View: 'View',
  Text: 'Text',
  Pressable: 'Pressable',
  ActivityIndicator: 'ActivityIndicator',
  StyleSheet: { create: (styles: unknown) => styles, absoluteFill: {} },
  PixelRatio: { getFontScale: () => 1 },
  useWindowDimensions: () => ({ width: 390, height: 844, fontScale: 1 }),
}));
vi.mock('react-native-reanimated', () => ({
  default: { View: 'AnimatedView' },
  useSharedValue: (value: number) => ({ value }),
  useAnimatedStyle: () => ({}),
  withSpring: (value: number) => value,
}));
vi.mock('expo-haptics', () => ({
  impactAsync: vi.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));
vi.mock('@expo/vector-icons/Ionicons', () => ({ default: 'Icon' }));
vi.mock('@/lib/sellerContact', () => ({
  normalizePhoneForWhatsApp: (phone: string | null | undefined) => (phone ? '237699000000' : null),
  openWhatsAppForListing: vi.fn(),
}));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function listing(partial: Partial<ListingDetail> = {}): ListingDetail {
  return {
    id: 'listing-1',
    title: 'Téléphone',
    price: 150000,
    city: 'Douala',
    description: 'Occasion',
    created_at: '2026-01-01T00:00:00.000Z',
    views_count: 3,
    seller_id: 'seller-1',
    images: [],
    seller: {
      full_name: 'Awa',
      phone: '+237699000000',
      created_at: null,
      is_banned: false,
    },
    ...partial,
  };
}

function byType(renderer: ReactTestRenderer, type: string) {
  return renderer.root.findAll((node) => node.type === type);
}

function labels(renderer: ReactTestRenderer): string[] {
  return byType(renderer, 'Pressable').map((node) => String(node.props.accessibilityLabel ?? ''));
}

describe('ListingActions', () => {
  it('shows one primary contact action and the real secondary channels', () => {
    const onMessage = vi.fn();
    const onCall = vi.fn();
    const onSms = vi.fn();
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(
        <ListingActions
          listing={listing()}
          onMessagePress={onMessage}
          onWhatsAppPress={vi.fn()}
          onCallPress={onCall}
          onSmsPress={onSms}
        />
      );
    });
    expect(labels(renderer)).toEqual([
      'Contacter sur WhatsApp',
      'Envoyer un message au vendeur',
    ]);
    act(() => renderer.root.find((node) => node.props.accessibilityLabel === 'Envoyer un message au vendeur').props.onPress());
    expect(onMessage).toHaveBeenCalledTimes(1);
    act(() => renderer.unmount());
  });

  it('hides the bar for the listing owner', () => {
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(
        <ListingActions listing={listing()} onMessagePress={vi.fn()} isOwnListing />
      );
    });
    expect(byType(renderer, 'Pressable')).toHaveLength(0);
    act(() => renderer.unmount());
  });

  it('does not offer a phone channel when no number exists', () => {
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(
        <ListingActions
          listing={listing({ seller: { full_name: 'Awa', phone: null, created_at: null } })}
          onMessagePress={vi.fn()}
          onCallPress={vi.fn()}
          onSmsPress={vi.fn()}
        />
      );
    });
    expect(labels(renderer)).toEqual(['Envoyer un message au vendeur']);
    act(() => renderer.unmount());
  });
});
