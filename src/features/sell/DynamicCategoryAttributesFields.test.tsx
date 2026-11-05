import React from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { DynamicCategoryAttributesFields } from './DynamicCategoryAttributesFields';

vi.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  Pressable: 'Pressable',
  ActivityIndicator: 'ActivityIndicator',
  Modal: 'Modal',
  ScrollView: 'ScrollView',
  StyleSheet: { create: (s: unknown) => s, hairlineWidth: 1 },
  Platform: { OS: 'ios' },
}));
vi.mock('@/components/Input', () => ({ Input: 'Input' }));
vi.mock('@expo/vector-icons/Ionicons', () => ({ default: 'Ionicons' }));
vi.mock('@/theme', () => ({
  colors: {
    primary: '#16a34a',
    text: '#111',
    textSecondary: '#666',
    textMuted: '#999',
    border: '#ccc',
    borderLight: '#eee',
    surface: '#fff',
    surfaceSubtle: '#f9f9f9',
    background: '#fafafa',
  },
  spacing: { base: 16, sm: 8, xs: 4 },
  typography: { sm: { fontSize: 14 }, base: { fontSize: 16 } },
  fontWeights: { bold: '700', semibold: '600', medium: '500' },
  radius: { full: 999, xl: 16, lg: 12, '2xl': 16 },
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function collectText(tree: ReturnType<typeof create>): string {
  return tree.root
    .findAllByType('Text' as unknown as React.ComponentType)
    .map((node) => String(node.props.children ?? ''))
    .join('\n');
}

describe('DynamicCategoryAttributesFields mode édition (progressive absent)', () => {
  it('conserve le hint historique et affiche les champs sans en-tête repliable', () => {
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(
        <DynamicCategoryAttributesFields
          definitions={[
            {
              key: 'mileage',
              label_fr: 'Kilométrage',
              type: 'number',
              required: false,
              definition_id: 'def-1',
            } as never,
          ]}
          optionsByDefinitionId={new Map()}
          loading={false}
          values={{ mileage: '' }}
          onChange={() => undefined}
        />
      );
    });
    const text = collectText(tree);
    expect(text).toContain('Complétez les caractéristiques pour une meilleure visibilité.');
    expect(text).toContain('Caractéristiques');
    expect(text).not.toContain('renseignées');
  });
});
