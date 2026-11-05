import React from 'react';
import { act, create } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountPriorityActions } from './AccountPriorityActions';

const m = vi.hoisted(() => ({
  push: vi.fn(),
  getMySellerProStatus: vi.fn(),
  handleShare: vi.fn(),
  shopName: 'Boutique QA',
}));

vi.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  Pressable: ({
    children,
    onPress,
    accessibilityLabel,
    ...props
  }: {
    children: React.ReactNode;
    onPress?: () => void;
    accessibilityLabel?: string;
  }) =>
    React.createElement(
      'Pressable',
      { ...props, onPress, accessibilityLabel },
      children
    ),
  ActivityIndicator: 'ActivityIndicator',
  Platform: { OS: 'ios', select: (o: Record<string, unknown>) => o.ios ?? o.default },
  StyleSheet: { create: (s: unknown) => s, hairlineWidth: 1 },
}));

vi.mock('expo-router', () => ({
  useRouter: () => ({ push: m.push }),
}));

vi.mock('@expo/vector-icons/Ionicons', () => ({ default: 'Icon' }));

vi.mock('@/features/shops/useProSellerActivation', () => ({
  useProSellerActivation: () => {
    const status = m.getMySellerProStatus();
    if (status === 'loading') {
      return {
        loading: true,
        hasShop: false,
        shopSlug: null,
        shopName: null,
        sharing: false,
        handleShare: m.handleShare,
      };
    }
    if (status === 'shop') {
      return {
        loading: false,
        hasShop: true,
        shopSlug: 'ma-boutique',
        shopName: m.shopName,
        sharing: false,
        handleShare: m.handleShare,
      };
    }
    return {
      loading: false,
      hasShop: false,
      shopSlug: null,
      shopName: null,
      sharing: false,
      handleShare: m.handleShare,
    };
  },
}));

vi.mock('@/theme', () => ({
  colors: {
    primary: '#16A34A',
    surface: '#fff',
    text: '#111',
    textSecondary: '#666',
    borderLight: '#eee',
    surfaceSubtle: '#f4f4f5',
  },
  spacing: { sm: 8, xs: 4, screenHorizontal: 16 },
  typography: { sm: {}, xs: {} },
  fontWeights: { bold: '700' },
  radius: { xl: 16 },
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

async function renderActions() {
  let tree!: ReturnType<typeof create>;
  await act(async () => {
    tree = create(<AccountPriorityActions />);
  });
  return tree;
}

function pressables(tree: ReturnType<typeof create>) {
  return tree.root.findAllByType('Pressable' as unknown as React.ComponentType);
}

describe('AccountPriorityActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.getMySellerProStatus.mockReturnValue('noShop');
    m.shopName = 'Boutique QA';
  });

  it('returns null while loading', async () => {
    m.getMySellerProStatus.mockReturnValue('loading');
    const tree = await renderActions();
    expect(tree.toJSON()).toBeNull();
  });

  it('shows Mes annonces and Créer ma boutique when no shop', async () => {
    const tree = await renderActions();
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('Mes annonces');
    expect(json).toContain('Créer ma boutique');
    expect(json).not.toContain('Partager');
    expect(pressables(tree)).toHaveLength(2);
  });

  it('navigates listings and pro-shop from tiles when no shop', async () => {
    const tree = await renderActions();
    const buttons = pressables(tree);
    await act(async () => {
      buttons[0].props.onPress();
      buttons[1].props.onPress();
    });
    expect(m.push).toHaveBeenCalledWith('/account/listings');
    expect(m.push).toHaveBeenCalledWith('/account/pro-shop');
  });

  it('uses separate shop navigation and Partager actions when shop exists', async () => {
    m.getMySellerProStatus.mockReturnValue('shop');
    const tree = await renderActions();
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('Ma boutique');
    expect(json).toContain('Partager');
    expect(json).not.toContain('Partager ma boutique');
    const buttons = pressables(tree);
    expect(buttons.length).toBe(3);
    await act(async () => {
      buttons[1].props.onPress();
    });
    expect(m.push).toHaveBeenCalledWith('/shop/ma-boutique');
    await act(async () => {
      buttons[2].props.onPress();
    });
    expect(m.handleShare).toHaveBeenCalledTimes(1);
    expect(m.push).toHaveBeenCalledTimes(1);
  });

  it('truncates long shop name on one line', async () => {
    m.getMySellerProStatus.mockReturnValue('shop');
    m.shopName =
      'Boutique avec un nom extrêmement long pour valider la largeur compacte';
    const tree = await renderActions();
    const subtitle = tree.root
      .findAllByType('Text' as unknown as React.ComponentType)
      .find((node) => node.props.numberOfLines === 1);
    expect(subtitle?.props.children).toContain('extrêmement long');
    expect(subtitle?.props.numberOfLines).toBe(1);
  });
});
