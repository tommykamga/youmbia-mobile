import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { expect, it, vi } from 'vitest';
import { HomeCategoryStrip, HomeCategoryStripContent } from './HomeCategoryStrip';
const categories = vi.hoisted(() => [
  { level: 0, icon: null, form_profile: null, id: 987, name: 'Électronique', slug: 'electronique', parent_id: null },
  { level: 0, icon: null, form_profile: null, id: 145, name: 'Mode & Beauté', slug: 'mode-beaute', parent_id: null },
  { level: 1, icon: null, form_profile: null, id: 999, name: 'Enfant', slug: 'enfant', parent_id: 987 },
]);
vi.mock('react-native', () => ({ View: 'View', Text: 'Text', Pressable: 'Pressable', ScrollView: 'ScrollView', Platform: { OS: 'ios' }, StyleSheet: { create: (s: unknown) => s } }));
vi.mock('@expo/vector-icons/Ionicons', () => ({ default: 'Icon' }));
vi.mock('@/hooks/useMarketplaceCategories', () => ({ useMarketplaceCategories: () => ({ categories }) }));
vi.mock('@/theme', () => ({ colors: {}, semantic: {}, getShadowStyle: () => ({}) }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
it('shares the same visual output and business IDs between the normal wrapper and supplied demo taxonomy', () => {
  const press = vi.fn(); const autres = vi.fn(); let normal!: ReactTestRenderer; let demo!: ReactTestRenderer;
  const props = { compact: true, bucket: 'regular' as const, selectedCategoryId: 987, onCategoryPress: press, onAutresPress: autres };
  act(() => {
    normal = create(<HomeCategoryStrip {...props} />);
    demo = create(<HomeCategoryStripContent {...props} categories={categories} />);
  });
  expect(JSON.parse(JSON.stringify(demo.toJSON()))).toEqual(JSON.parse(JSON.stringify(normal.toJSON())));
  const buttons = demo.root.findAllByType('Pressable' as never);
  expect(buttons.map(node => node.props.accessibilityLabel)).toEqual(['Mode & Beauté', 'Électronique', 'Autres']);
  expect(buttons[1].props.accessibilityState.selected).toBe(true);
  expect(demo.root.findAllByType('Text' as never).map(node => node.props.children)).toContain('Électronique');
  expect(demo.root.findAllByType('Text' as never).map(node => node.props.children)).not.toContain('Téléphones');
  expect(demo.root.findAllByType('Icon' as never).map(node => node.props.name)).toContain('laptop');
  act(() => { buttons[1].props.onPress(); buttons[2].props.onPress(); });
  expect(press).toHaveBeenCalledWith('987', 'Électronique'); expect(autres).toHaveBeenCalledTimes(1);
  expect(demo.root.findAllByType('Icon' as never).every(node => node.props.size === 25)).toBe(true);
  act(() => { normal.unmount(); demo.unmount(); });
});
