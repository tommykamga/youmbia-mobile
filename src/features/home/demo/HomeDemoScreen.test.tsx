import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { expect, it, vi } from 'vitest';
import { HomeDemoScreen } from './HomeDemoScreen';
vi.mock('react-native', () => ({ View: 'View', Text: 'Text', TextInput: 'Input', Pressable: 'Pressable', ScrollView: 'ScrollView', Image: 'Image',
  Modal: ({ visible, children }: { visible: boolean; children: React.ReactNode }) => visible ? children : null,
  StyleSheet: { create: (s: unknown) => s }, useWindowDimensions: () => ({ width: 390, fontScale: 1 }) }));
vi.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeArea' }));
vi.mock('@expo/vector-icons/Ionicons', () => ({ default: 'Icon' }));
vi.mock('@/components/HomeBrandHeader', () => ({ HomeBrandHeader: 'BrandHeader' }));
vi.mock('@/components/HomeCategoryStrip', () => ({ HomeCategoryStripContent: 'Categories' }));
vi.mock('@/components/KeyboardSafeView', () => ({ KeyboardSafeView: 'KeyboardSafe' }));
vi.mock('@/features/shops/PopularShopsSection', () => ({ PopularShopsSection: 'Shops' }));
vi.mock('@/features/listings/ListingFeed', () => ({ ListingFeed: 'Feed' }));
vi.mock('@/features/listings/ListingCard', () => ({ ListingCard: 'Card' }));
vi.mock('@/lib/responsiveLayout', () => ({ getWindowSizeBucket: () => 'regular' }));
vi.mock('@/hooks/useMarketplaceCategories', () => ({ useMarketplaceCategories: () => ({ categories: [
  { id: 987, name: 'Électronique', slug: 'electronique', parent_id: null, level: 0, icon: null, form_profile: null },
] }) }));
vi.mock('@/theme', () => ({ colors: { surface: '#FFF' } }));
vi.mock('./demoImages', () => ({ DEMO_IMAGES: {} }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
it('keeps developer commands collapsed, exposes them explicitly, resets business filters and exits locally', () => {
  const exit = vi.fn(); let r!: ReactTestRenderer;
  act(() => { r = create(<HomeDemoScreen onExit={exit} />); });
  const texts = () => r.root.findAllByType('Text' as never).map(n => n.props.children);
  expect(texts()).toContain('Démonstration'); expect(texts()).not.toContain('Quitter la démonstration');
  const feed = () => r.root.findByType('Feed' as never);
  const strip = feed().props.listHeaderComponent.props.children[0];
  act(() => strip.props.onCategoryPress('987'));
  expect(feed().props.previewProvider.total).toBe(8);
  const indicator = r.root.findAllByType('Pressable' as never).find(n => n.props.accessibilityLabel === 'Commandes de démonstration')!;
  act(() => indicator.props.onPress());
  expect(indicator.props.accessibilityState.expanded).toBe(true);
  expect(texts()).toContain('Quitter la démonstration');
  const command = (text: string) => r.root.findAllByType('Pressable' as never).find(n => n.findAllByType('Text' as never).some(t => t.props.children === text))!;
  act(() => command('Réinitialiser les critères démo').props.onPress());
  expect(feed().props.previewProvider.total).toBe(48);
  act(() => command('Quitter la démonstration').props.onPress()); expect(exit).toHaveBeenCalledTimes(1);
  act(() => indicator.props.onPress()); expect(texts()).not.toContain('Quitter la démonstration');
  act(() => r.unmount());
});
