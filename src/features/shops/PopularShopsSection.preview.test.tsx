import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { beforeEach, expect, it, vi } from 'vitest';
import { PopularShopsSection } from './PopularShopsSection';
import { ShopCard } from './ShopCard';
import { DEMO_SHOPS } from '@/features/home/demo/demoProvider';
const m = vi.hoisted(() => ({ load: vi.fn(), push: vi.fn() }));
vi.mock('react-native', () => ({ View: 'View', Text: 'Text', FlatList: 'FlatList', Pressable: 'Pressable', Image: 'Image', StyleSheet: { create: (s: unknown) => s } }));
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
  expect(rail.props.horizontal).toBe(true); expect(rail.props.data).toHaveLength(3);
  act(() => { card = create(rail.props.renderItem({ item: DEMO_SHOPS[0] })); });
  expect(card.root.findByType('Image' as never).props.source).toBe(42);
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
