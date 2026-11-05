import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ShopCard } from './ShopCard';
import type { PopularShop } from '@/services/shops/getPopularShops';

const m = vi.hoisted(() => ({ push: vi.fn(), isDisplayable: vi.fn() }));

vi.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  Pressable: 'Pressable',
  Image: 'Image',
  Platform: { OS: 'ios', Version: '17' },
  StyleSheet: { create: (s: unknown) => s, absoluteFillObject: {} },
}));

vi.mock('@/lib/shopMediaUrl', () => ({
  isDisplayableShopMediaUrl: (url: string | null | undefined) => m.isDisplayable(url),
}));

vi.mock('expo-router', () => ({ useRouter: () => ({ push: m.push }) }));
vi.mock('@expo/vector-icons/Ionicons', () => ({ default: 'Icon' }));
vi.mock('./ProSellerBadge', () => ({ ProSellerBadge: 'Badge' }));
vi.mock('@/theme', () => ({
  colors: { primary: '#0', text: '#0', textMuted: '#0', textSecondary: '#0', surface: '#fff', borderLight: '#eee', surfaceSubtle: '#f5' },
  spacing: { sm: 8 },
  typography: { sm: {}, xs: {} },
  fontWeights: { bold: '700', semibold: '600', medium: '500' },
  radius: { lg: 12, md: 8, full: 99 },
  cardStyles: { default: {} },
  getShadowStyle: () => ({}),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const shop = (over: Partial<PopularShop> = {}): PopularShop => ({
  id: 'shop-1',
  name: 'Ma boutique',
  slug: 'ma-boutique',
  city: 'Douala',
  status: 'active',
  description: null,
  logo_url: 'https://cdn.example/logo.png',
  banner_url: 'https://cdn.example/banner.png',
  active_listings_count: 2,
  is_verified: false,
  is_featured: false,
  owner_id: 'owner-1',
  whatsapp_phone: null,
  phone: null,
  created_at: '2026-01-01T00:00:00.000Z',
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  m.isDisplayable.mockImplementation((url: string | null | undefined) =>
    Boolean(url && /^https?:\/\//i.test(String(url).trim()))
  );
});

function images(r: ReactTestRenderer) {
  return r.root.findAllByType('Image' as never);
}

describe('ShopCard media fallbacks', () => {
  it('default variant shows banner and logo when URLs are displayable', () => {
    let r!: ReactTestRenderer;
    act(() => {
      r = create(<ShopCard shop={shop()} variant="default" />);
    });
    expect(images(r)).toHaveLength(2);
    act(() => r.unmount());
  });

  it('default variant uses banner fallback when URL is not displayable', () => {
    m.isDisplayable.mockReturnValue(false);
    let r!: ReactTestRenderer;
    act(() => {
      r = create(<ShopCard shop={shop()} variant="default" />);
    });
    expect(images(r)).toHaveLength(0);
    act(() => r.unmount());
  });

  it('default variant switches to fallback after banner onError', () => {
    let r!: ReactTestRenderer;
    act(() => {
      r = create(<ShopCard shop={shop()} variant="default" />);
    });
    expect(images(r)).toHaveLength(2);
    act(() => {
      images(r)[0].props.onError();
    });
    expect(r.root.findAllByType('Image' as never)).toHaveLength(1);
    act(() => r.unmount());
  });

  it('compact variant hides logo image when storage path is not displayable', () => {
    m.isDisplayable.mockImplementation((url) => url === shop().banner_url);
    let r!: ReactTestRenderer;
    act(() => {
      r = create(<ShopCard shop={shop({ logo_url: 'owner/shops/x/logo.jpg' })} variant="compact" />);
    });
    expect(images(r)).toHaveLength(1);
    act(() => r.unmount());
  });

  it('home variant uses storefront fallback when banner missing', () => {
    let r!: ReactTestRenderer;
    act(() => {
      r = create(
        <ShopCard
          variant="home"
          shop={shop({ banner_url: null })}
          preview={{ onOpen: vi.fn() }}
        />
      );
    });
    expect(images(r)).toHaveLength(0);
    expect(
      r.root.findAllByType('Icon' as never).some((node) => node.props.name === 'storefront-outline')
    ).toBe(true);
    act(() => r.unmount());
  });

  it('home variant recovers after banner URL change following onError', () => {
    const onOpen = vi.fn();
    let r!: ReactTestRenderer;
    act(() => {
      r = create(
        <ShopCard
          variant="home"
          shop={shop()}
          preview={{ onOpen, bannerSource: { uri: 'https://cdn.example/banner.png' } }}
        />
      );
    });
    act(() => {
      images(r)[0].props.onError();
    });
    expect(images(r)).toHaveLength(0);
    act(() => {
      r.update(
        <ShopCard
          variant="home"
          shop={shop({ banner_url: 'https://cdn.example/new-banner.png' })}
          preview={{ onOpen, bannerSource: { uri: 'https://cdn.example/new-banner.png' } }}
        />
      );
    });
    expect(images(r)).toHaveLength(1);
    act(() => r.unmount());
  });
});
