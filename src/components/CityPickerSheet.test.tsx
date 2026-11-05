import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { expect, it, vi } from 'vitest';
import { CityPickerSheet } from './CityPickerSheet';
vi.mock('react-native', () => ({ View: 'View', Text: 'Text', TextInput: 'Input', Pressable: 'Pressable', Modal: 'Modal', ScrollView: 'ScrollView', Keyboard: { dismiss: vi.fn() }, StyleSheet: { create: (s: unknown) => s } }));
vi.mock('@expo/vector-icons/Ionicons', () => ({ default: 'Icon' }));
vi.mock('./KeyboardSafeView', () => ({ KeyboardSafeView: 'KeyboardSafe' }));
vi.mock('@/theme', () => ({ colors: {} }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
it('has one title and keeps suggestions/drafts, apply, reset and close independent', () => {
  const apply = vi.fn(), change = vi.fn(), reset = vi.fn(), close = vi.fn(); let r!: ReactTestRenderer;
  act(() => { r = create(<CityPickerSheet visible value="Douala" suggestions={['Douala', 'Yaoundé']} onApply={apply} onChangeText={change} onReset={reset} onClose={close} />); });
  expect(r.root.findAllByType('Text' as never).filter(node => node.props.children === 'Ville')).toHaveLength(1);
  const buttons = r.root.findAllByType('Pressable' as never);
  const label = (text: string) => buttons.find(node => node.findAllByType('Text' as never).some(child => child.props.children === text))!;
  // Exclude the outer sheet/backdrop when looking up a text button.
  const textButton = (text: string) => buttons.filter(node => node.findAllByType('Text' as never).some(child => child.props.children === text)).at(-1)!;
  act(() => textButton('Yaoundé').props.onPress()); expect(change).toHaveBeenCalledWith('Yaoundé'); expect(apply).not.toHaveBeenCalled();
  act(() => buttons.find(node => node.props.accessibilityLabel === 'Fermer le choix de ville')!.props.onPress());
  expect(close).toHaveBeenCalledTimes(1); expect(apply).not.toHaveBeenCalled();
  act(() => textButton('Appliquer').props.onPress()); expect(apply).toHaveBeenCalledWith('Douala');
  act(() => textButton('Réinitialiser').props.onPress()); expect(reset).toHaveBeenCalledTimes(1);
  expect(label('Appliquer')).toBeDefined();
  act(() => r.unmount());
});
