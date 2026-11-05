import React from 'react';
import { act, create } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProSellerActivationCard } from './ProSellerActivationCard';

const m = vi.hoisted(() => ({
  push: vi.fn(),
  getMySellerProStatus: vi.fn(),
  verifiedSubject: vi.fn(),
  shareShop: vi.fn(),
}));

vi.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  Pressable: ({
    children,
    onPress,
    ...props
  }: {
    children: React.ReactNode | ((state: { pressed: boolean }) => React.ReactNode);
    onPress?: () => void;
  }) =>
    React.createElement(
      'Pressable',
      { ...props, onPress },
      typeof children === 'function' ? children({ pressed: false }) : children
    ),
  Platform: { OS: 'ios', select: (o: Record<string, unknown>) => o.ios ?? o.default },
  StyleSheet: { create: (s: unknown) => s, hairlineWidth: 1 },
}));

vi.mock('expo-linear-gradient', () => ({
  LinearGradient: 'LinearGradient',
}));

const ReactForRouter = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('react') as typeof import('react');
});

vi.mock('expo-router', () => ({
  useRouter: () => ({ push: m.push }),
  useFocusEffect: (cb: () => void) => {
    ReactForRouter.useEffect(() => {
      cb();
    }, [cb]);
  },
}));

vi.mock('@expo/vector-icons/Ionicons', () => ({ default: 'Icon' }));

vi.mock('@/components', () => ({
  Button: ({ children, onPress }: { children: React.ReactNode; onPress?: () => void }) =>
    React.createElement('Button', { onPress }, children),
}));

vi.mock('@/lib/shareShop', () => ({ shareShop: m.shareShop }));

vi.mock('@/services/shops', () => ({
  getMySellerProStatus: m.getMySellerProStatus,
}));

vi.mock('@/services/listings/listingTrust', () => ({
  verifiedSubject: m.verifiedSubject,
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
  spacing: {
    base: 12,
    sm: 8,
    xs: 4,
    screenHorizontal: 16,
    lg: 20,
    md: 16,
  },
  typography: { base: {}, sm: {}, xs: {} },
  fontWeights: { bold: '700', black: '900', semibold: '600' },
  radius: { xl: 16, lg: 12, full: 999 },
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

async function renderCard(variant: 'account' | 'accountCompact' | 'listings' = 'accountCompact') {
  let tree!: ReturnType<typeof create>;
  await act(async () => {
    tree = create(<ProSellerActivationCard variant={variant} />);
    await Promise.resolve();
    await Promise.resolve();
  });
  return tree;
}

describe('ProSellerActivationCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.verifiedSubject.mockResolvedValue(false);
    m.shareShop.mockResolvedValue(undefined);
  });

  it('renders promo CTA without shop (accountCompact)', async () => {
    m.getMySellerProStatus.mockResolvedValue({
      data: { sellerType: 'individual', shop: null },
      error: null,
    });
    const tree = await renderCard('accountCompact');
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('Créer ma boutique');
    expect(json).toContain('Boutique Pro');
    expect(json).toContain('Lien partageable');
    expect(json).not.toContain('LinearGradient');
  });

  it('navigates to pro-shop on promo press', async () => {
    m.getMySellerProStatus.mockResolvedValue({
      data: { sellerType: 'individual', shop: null },
      error: null,
    });
    const tree = await renderCard('accountCompact');
    const pressable = tree.root.findByType('Pressable' as unknown as React.ComponentType);
    await act(async () => {
      pressable.props.onPress();
    });
    expect(m.push).toHaveBeenCalledWith('/account/pro-shop');
  });

  it('renders existing shop actions (accountCompact)', async () => {
    m.getMySellerProStatus.mockResolvedValue({
      data: {
        sellerType: 'pro',
        shop: { id: 's1', slug: 'ma-boutique', name: 'Boutique QA', city: 'Douala' },
      },
      error: null,
    });
    const tree = await renderCard('accountCompact');
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('Boutique QA');
    expect(json).toContain('Voir la boutique');
    expect(json).toContain('Partager');
    const buttons = tree.root.findAllByType('Button' as unknown as React.ComponentType);
    expect(buttons.length).toBe(2);
  });

  it('keeps full promo illustration for legacy account variant', async () => {
    m.getMySellerProStatus.mockResolvedValue({
      data: { sellerType: 'individual', shop: null },
      error: null,
    });
    const tree = await renderCard('account');
    expect(JSON.stringify(tree.toJSON())).toContain('LinearGradient');
  });

  it('returns null while loading', async () => {
    m.getMySellerProStatus.mockImplementation(() => new Promise(() => {}));
    let tree!: ReturnType<typeof create>;
    await act(async () => {
      tree = create(<ProSellerActivationCard variant="accountCompact" />);
    });
    expect(tree.toJSON()).toBeNull();
  });
});
