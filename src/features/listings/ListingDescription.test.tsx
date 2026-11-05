import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { ListingDescription } from './ListingDescription';

vi.mock('react-native', () => ({
  Platform: { OS: 'ios', select: (options: { ios?: unknown; default?: unknown }) => options.ios ?? options.default },
  View: 'View',
  Text: 'Text',
  Pressable: 'Pressable',
  StyleSheet: { create: (styles: unknown) => styles },
}));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function byType(renderer: ReactTestRenderer, type: string) {
  return renderer.root.findAll((node) => node.type === type);
}

function texts(renderer: ReactTestRenderer): string[] {
  return byType(renderer, 'Text').map((node) => {
    const children = node.props.children;
    return Array.isArray(children) ? children.join('') : String(children ?? '');
  });
}

describe('ListingDescription', () => {
  it('keeps a short description intact, including line breaks', () => {
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(<ListingDescription description={'Une ligne\n\nLa suivante'} />);
    });
    const body = byType(renderer, 'Text')[1];
    expect(body.props.children).toBe('Une ligne\n\nLa suivante');
    expect(body.props.numberOfLines).toBeUndefined();
    expect(texts(renderer)).not.toContain('Lire la suite');
    act(() => renderer.unmount());
  });

  it('collapses a long description and can expand it again', () => {
    const description = `${'Phrase visible. '.repeat(40)}\nDernière ligne.`;
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(<ListingDescription description={description} />);
    });
    const body = () => byType(renderer, 'Text')[1];
    expect(body().props.numberOfLines).toBe(6);
    expect(body().props.children).toBe(description.trim());
    act(() => renderer.root.find((node) => node.props.accessibilityLabel === 'Lire la suite de la description').props.onPress());
    expect(body().props.numberOfLines).toBeUndefined();
    expect(texts(renderer)).toContain('Réduire');
    act(() => renderer.root.find((node) => node.props.accessibilityLabel === 'Réduire la description').props.onPress());
    expect(body().props.numberOfLines).toBe(6);
    act(() => renderer.unmount());
  });

  it('renders nothing when the description is empty', () => {
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(<ListingDescription description="   " />);
    });
    expect(byType(renderer, 'Text')).toHaveLength(0);
    act(() => renderer.unmount());
  });
});
