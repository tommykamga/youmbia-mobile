import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { expect, it, vi } from 'vitest';
import { ListingCard } from './ListingCard';
import { DEMO_LISTINGS } from '@/features/home/demo/demoProvider';
import { formatPrice } from '@/lib/format';

const m = vi.hoisted(() => ({ push: vi.fn(), favorite: vi.fn(), source: vi.fn() }));
vi.mock('react-native', () => ({
  View: 'View', Text: 'Text', Pressable: 'Pressable', ImageBackground: 'ImageBackground',
  StyleSheet: { create: (s: unknown) => s }, useWindowDimensions: () => ({ width: 390, fontScale: 1.5 }),
}));
vi.mock('react-native-reanimated', () => ({
  default: { createAnimatedComponent: () => 'AnimatedPressable' },
  useSharedValue: () => ({ value: 1 }), useAnimatedStyle: () => ({}), withSpring: () => 1, withTiming: () => 1,
  FadeInDown: { duration: () => ({ springify: () => ({}) }) }, Easing: { out: () => ({}), quad: {} },
}));
vi.mock('expo-router', () => ({ useRouter: () => ({ push: m.push }) }));
vi.mock('@expo/vector-icons/Ionicons', () => ({ default: 'Icon' }));
vi.mock('@/components/FavoriteButton', () => ({ FavoriteButton: () => { m.favorite(); return null; } }));
vi.mock('@/features/shops/ProSellerBadge', () => ({ ProSellerBadge: 'Badge' }));
vi.mock('@/lib/analytics', () => ({ setListingViewSource: m.source }));
vi.mock('@/theme', () => ({ cardStyles: { default: {} }, colors: {}, spacing: {}, typography: { sm: {}, xs: {} }, fontWeights: {}, radius: {}, ui: { spacing: {}, colors: {} }, getShadowStyle: () => ({}) }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it('uses a bundled photo and local detail/favorite controls without touching real navigation or favorite APIs', () => {
  const open = vi.fn(); let r!: ReactTestRenderer;
  act(() => { r = create(<ListingCard listing={DEMO_LISTINGS[0]} feedPresentation="home" preview={{ image: 42, onOpen: open, favorite: <React.Fragment>Favori local</React.Fragment> }} />); });
  expect(r.root.findByType('ImageBackground' as never).props.source).toBe(42);
  act(() => r.root.findByType('AnimatedPressable' as never).props.onPress());
  expect(open).toHaveBeenCalledTimes(1); expect(m.push).not.toHaveBeenCalled(); expect(m.source).not.toHaveBeenCalled(); expect(m.favorite).not.toHaveBeenCalled();
  const expected = formatPrice(DEMO_LISTINGS[0].price);
  const price = r.root.findAllByType('Text' as never).find(
    (x) => typeof x.props.children === 'string' && x.props.children === expected,
  );
  expect(price).toBeDefined();
  expect(expected).toMatch(/\u202f/);
  expect(price?.props.numberOfLines).toBeUndefined();
  expect(price?.props.ellipsizeMode).toBeUndefined();
  act(() => r.unmount());
});

it('retains the no-photo state in a preview with no bundled image', () => {
  let r!: ReactTestRenderer;
  act(() => { r = create(<ListingCard listing={DEMO_LISTINGS[10]} feedPresentation="home" preview={{ onOpen: vi.fn(), favorite: null }} />); });
  expect(r.root.findAllByType('ImageBackground' as never)).toHaveLength(0);
  expect(r.root.findAllByType('Text' as never).some(x => x.props.children === 'Aucune photo')).toBe(true);
  act(() => r.unmount());
});

it('fails closed if a fixture is accidentally rendered without its local controls', () => {
  let r!: ReactTestRenderer;
  act(() => { r = create(<ListingCard listing={DEMO_LISTINGS[0]} feedPresentation="home" />); });
  expect(r.toJSON()).toBeNull(); expect(m.push).not.toHaveBeenCalled(); expect(m.favorite).not.toHaveBeenCalled();
  act(() => r.unmount());
});
