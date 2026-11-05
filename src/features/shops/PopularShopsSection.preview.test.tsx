import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { beforeEach, expect, it, vi } from 'vitest';
import { PopularShopsSection } from './PopularShopsSection';
import { ShopCard } from './ShopCard';
import { DEMO_SHOPS } from '@/features/home/demo/demoProvider';
const m = vi.hoisted(() => ({ load: vi.fn(), push: vi.fn() }));
vi.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  FlatList: 'FlatList',
  Pressable: 'Pressable',
  Image: 'Image',
  Platform: { OS: 'ios', Version: '17' },
  NativeModules: { BlobModule: { getConstants: () => ({}) } },
  StyleSheet: { create: (s: unknown) => s },
}));
vi.mock('@/lib/shopMediaUrl', () => ({
  isDisplayableShopMediaUrl: (url: string | null | undefined) => Boolean(url && String(url).trim()),
}));
vi.mock('expo-router', () => ({ useRouter: () => ({ push: m.push }) }));
vi.mock('@expo/vector-icons/Ionicons', () => ({ default: 'Icon' }));
vi.mock('@/components', () => ({ AppSectionHeader: 'Header' }));
vi.mock('@/services/shops/popularShopsCache', () => ({ getPopularShopsCached: m.load }));
vi.mock('@/lib/responsiveLayout', () => ({ useHomeMarketplaceGridInset: () => 16 }));
vi.mock('./ShopsRailSkeleton', () => ({ ShopsRailSkeleton: 'Skeleton' }));
vi.mock('./ProSellerBadge', () => ({ ProSellerBadge: 'Badge' }));
vi.mock('@/theme', () => ({ colors: {}, spacing: {}, typography: { sm: {}, xs: {} }, fontWeights: {}, radius: {}, cardStyles: {}, getShadowStyle: () => ({}), ui: { colors: {} } }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
beforeEach(() => vi.clearAllMocks());

it('reuses the real rail and cards with local shops, banners and destinations without loading real shops', async () => {
  const open = vi.fn(); let r!: ReactTestRenderer; let card!: ReactTestRenderer;
  await act(async () => { r = create(<PopularShopsSection preview={{ shops: DEMO_SHOPS, onOpen: open, banners: { [DEMO_SHOPS[0].id]: 42 } }} />); });
  expect(m.load).not.toHaveBeenCalled();
  const rail = r.root.findByType('FlatList' as never);
  expect(rail.props.horizontal).toBe(true); expect(rail.props.snapToInterval).toBe(284); expect(rail.props.data).toHaveLength(3);
  act(() => { card = create(rail.props.renderItem({ item: DEMO_SHOPS[0] })); });
  expect(card.root.findByType('Image' as never).props.source).toBe(42);
  expect(card.root.findAllByType('Pressable' as never)).toHaveLength(1);
  expect(card.root.findAllByType('Text' as never).some(node => node.props.children === 'Douala · 8 annonces')).toBe(true);
  expect(card.root.findAllByType('Badge' as never)).toHaveLength(0);
  act(() => card.root.findAllByType('Pressable' as never)[0].props.onPress());
  expect(open).toHaveBeenCalledWith(DEMO_SHOPS[0]); expect(m.push).not.toHaveBeenCalled();
  act(() => { card.unmount(); r.unmount(); });
});

it('retains the normal empty-data condition and real shop navigation without preview', async () => {
  m.load.mockResolvedValueOnce({ data: [], error: null }); let r!: ReactTestRenderer;
  await act(async () => { r = create(<PopularShopsSection />); });
  expect(r.toJSON()).toBeNull(); expect(m.load).toHaveBeenCalledTimes(1);
  act(() => r.unmount());
  const realShop = { ...DEMO_SHOPS[0], id: 'real-shop-id', slug: 'real-shop-slug' };
  m.load.mockResolvedValueOnce({ data: [realShop], error: null });
  await act(async () => { r = create(<PopularShopsSection />); });
  let card!: ReactTestRenderer;
  act(() => { card = create(r.root.findByType('FlatList' as never).props.renderItem({ item: realShop })); });
  act(() => card.root.findAllByType('Pressable' as never)[0].props.onPress());
  expect(m.push).toHaveBeenCalledWith('/shop/real-shop-slug');
  act(() => { card.unmount(); r.unmount(); });
});

it('never routes a fictitious shop accidentally rendered without its preview destination', () => {
  let r!: ReactTestRenderer;
  act(() => { r = create(<ShopCard shop={DEMO_SHOPS[0]} />); });
  act(() => r.root.findAllByType('Pressable' as never)[0].props.onPress());
  expect(m.push).not.toHaveBeenCalled();
  act(() => r.unmount());
});


it('keeps the declared status and Voir button on the non-home variant and uses a cover fallback on home', () => {
  let legacy!: ReactTestRenderer; let home!: ReactTestRenderer;
  act(() => {
    legacy = create(<ShopCard shop={DEMO_SHOPS[0]} />);
    home = create(<ShopCard variant="home" shop={DEMO_SHOPS[0]} preview={{ onOpen: vi.fn() }} />);
  });
  expect(legacy.root.findAllByType('Badge' as never)).toHaveLength(1);
  expect(legacy.root.findAllByType('Text' as never).some(node => node.props.children === 'Voir')).toBe(true);
  expect(home.root.findAllByType('Image' as never)).toHaveLength(0);
  expect(home.root.findAllByType('Icon' as never).some(node => node.props.name === 'storefront-outline')).toBe(true);
  act(() => { legacy.unmount(); home.unmount(); });
});
