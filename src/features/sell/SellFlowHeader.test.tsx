import React from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import {
  SellFlowHeader,
  SELL_FLOW_HEADER_BACK_MIN_SIZE,
  getSellFlowHeaderWrapStyle,
} from './SellFlowHeader';
import {
  SELL_FLOW_HEADER_TITLE,
  formatSellFlowStepIndicator,
  formatSellFlowStepSubtitle,
  resolveSellFlowStepVisualState,
} from './sellFlowSteps';

vi.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  Pressable: 'Pressable',
  StyleSheet: {
    create: (s: unknown) => s,
    hairlineWidth: 1,
  },
}));
vi.mock('@expo/vector-icons/Ionicons', () => ({
  default: 'Ionicons',
}));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 47, bottom: 0, left: 0, right: 0 }),
}));
vi.mock('@/context/AppUpdateBannerInsetContext', () => ({
  useAppUpdateBannerInset: () => 0,
}));
vi.mock('@/features/account/accountScreen.constants', () => ({
  MARKETPLACE_TAB_TITLE_PADDING_BOTTOM: 6,
}));
vi.mock('@/theme', () => ({
  spacing: { screenHorizontal: 16, xs: 4, sm: 8 },
  typography: {
    lg: { fontSize: 18, lineHeight: 24 },
    sm: { fontSize: 14, lineHeight: 20 },
    xs: { fontSize: 12, lineHeight: 16 },
  },
  fontWeights: { bold: '700', semibold: '600', medium: '500' },
  radius: { full: 999 },
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function collectText(tree: ReturnType<typeof create>): string[] {
  return tree.root
    .findAllByType('Text' as unknown as React.ComponentType)
    .map((node) => String(node.props.children ?? ''));
}

describe('SellFlowHeader copy & progression', () => {
  it('formate indicateur et sous-titre pour chaque étape', () => {
    expect(formatSellFlowStepIndicator('photos')).toBe('1/3');
    expect(formatSellFlowStepSubtitle('photos')).toBe('Étape 1 sur 3 · Photos');
    expect(formatSellFlowStepIndicator('details')).toBe('2/3');
    expect(formatSellFlowStepSubtitle('details')).toBe('Étape 2 sur 3 · Détails');
    expect(formatSellFlowStepIndicator('review')).toBe('3/3');
    expect(formatSellFlowStepSubtitle('review')).toBe('Étape 3 sur 3 · Vérification');
  });

  it('distingue terminé, actif et à venir', () => {
    expect(resolveSellFlowStepVisualState(0, 1)).toBe('done');
    expect(resolveSellFlowStepVisualState(1, 1)).toBe('active');
    expect(resolveSellFlowStepVisualState(2, 1)).toBe('upcoming');
  });

  it('rend le titre fixe et la progression pour l’étape 2', () => {
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(
        <SellFlowHeader
          activeStepId="details"
          onBackPress={() => undefined}
          backAccessibilityLabel="Retour"
        />
      );
    });
    const texts = collectText(tree);
    expect(texts).toContain(SELL_FLOW_HEADER_TITLE);
    expect(texts).toContain('2/3');
    expect(texts).toContain('Étape 2 sur 3 · Détails');
    expect(texts).toContain('Photos');
    expect(texts).toContain('Détails');
    expect(texts).toContain('Vérification');
  });
});

describe('SellFlowHeader layout contract', () => {
  it('respecte la safe area et une cible retour ≥ 44 pt', () => {
    const wrap = getSellFlowHeaderWrapStyle(47);
    expect(wrap.paddingTop).toBe(47);
    expect(wrap.backgroundColor).toBe('#0B4D3C');
    expect(SELL_FLOW_HEADER_BACK_MIN_SIZE).toBeGreaterThanOrEqual(44);
  });
});
