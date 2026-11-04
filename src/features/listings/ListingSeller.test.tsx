import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { ListingSeller } from './ListingSeller';
import type { ListingDetail } from '@/services/listings';

vi.mock('react-native', () => ({
  Platform: { OS: 'ios', select: (options: { ios?: unknown; default?: unknown }) => options.ios ?? options.default },
  View: 'View',
  Text: 'Text',
  Pressable: 'Pressable',
  StyleSheet: { create: (styles: unknown) => styles },
}));
vi.mock('@expo/vector-icons/Ionicons', () => ({ default: 'Icon' }));
vi.mock('@/components', () => ({
  Button: 'Button',
  UserAvatar: 'UserAvatar',
}));
vi.mock('./SellerBadge', () => ({ SellerBadge: 'SellerBadge' }));
vi.mock('@/features/shops/ProSellerBadge', () => ({ ProSellerBadge: 'ProSellerBadge' }));
vi.mock('@/services/profile', () => ({
  getUserDisplayName: (_: unknown, fallback: string) => fallback,
}));
vi.mock('@/lib/format', () => ({
  formatJoinDate: () => '',
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function listing(partial: Partial<ListingDetail> = {}): ListingDetail {
  return {
    id: 'listing-1',
    title: 'Annonce',
    price: 1000,
    city: 'Douala',
    description: 'Test',
    created_at: '2026-01-01T00:00:00.000Z',
    views_count: 0,
    seller_id: 'seller-1',
    images: [],
    seller: {
      full_name: 'Marie',
      phone: null,
      created_at: null,
      is_banned: false,
      is_verified: false,
      phone_verified: false,
    },
    ...partial,
  };
}

function byType(renderer: ReactTestRenderer, type: string) {
  return renderer.root.findAll((node) => String(node.type) === type);
}

function textContents(renderer: ReactTestRenderer): string[] {
  return byType(renderer, 'Text')
    .map((node) => String(node.props.children ?? ''))
    .flatMap((chunk) => (Array.isArray(chunk) ? chunk.map(String) : [chunk]));
}

describe('ListingSeller', () => {
  it('uses a compact card when only the seller name and avatar are available', () => {
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(<ListingSeller listing={listing()} />);
    });
    const avatar = byType(renderer, 'UserAvatar')[0];
    expect(avatar.props.size).toBe(40);
    expect(textContents(renderer).some((t) => t.includes('Membre depuis'))).toBe(false);
    act(() => renderer.unmount());
  });

  it('shows extended seller details when real data exists', () => {
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(
        <ListingSeller
          listing={listing({
            seller: {
              full_name: 'Marie',
              phone: null,
              created_at: '2024-06-01T00:00:00.000Z',
              is_banned: false,
              is_verified: true,
            },
          })}
          listingCount={3}
        />
      );
    });
    const avatar = byType(renderer, 'UserAvatar')[0];
    expect(avatar.props.size).toBe(48);
    expect(textContents(renderer).some((t) => t.includes('3 annonces'))).toBe(true);
    act(() => renderer.unmount());
  });
});
