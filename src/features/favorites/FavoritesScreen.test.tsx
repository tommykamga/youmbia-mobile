import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FavoritesScreen from '../../../app/(tabs)/favorites';

const m = vi.hoisted(() => ({
  refresh: vi.fn(),
  favorites: new Set<string>(),
  getFavorites: vi.fn(),
  getSession: vi.fn(),
  getListingsByIds: vi.fn(),
}));

vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  FlatList: 'FlatList',
  RefreshControl: 'RefreshControl',
  View: 'View',
  Text: 'Text',
  StyleSheet: { create: (s: unknown) => s, hairlineWidth: 1 },
  InteractionManager: { runAfterInteractions: (fn: () => void) => { fn(); return { cancel: vi.fn() }; } },
  useWindowDimensions: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 }),
  PixelRatio: { getFontScale: () => 1 },
}));
const ReactForRouter = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- mock factory hoisted by Vitest
  return require('react') as typeof import('react');
});

vi.mock('expo-router', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  Redirect: 'Redirect',
  useFocusEffect: (cb: () => (() => void) | void) => {
    ReactForRouter.useEffect(() => {
      const cleanup = cb();
      return () => {
        if (typeof cleanup === 'function') cleanup();
      };
    }, [cb]);
  },
}));
vi.mock('@expo/vector-icons/Ionicons', () => ({ default: 'Icon' }));
vi.mock('@/components', () => ({
  Screen: ({ children }: { children: React.ReactNode }) => children,
  EmptyState: 'EmptyState',
  Button: 'Button',
  LoadingState: 'LoadingState',
}));
vi.mock('@/features/listings', () => ({ ListingCard: 'ListingCard' }));
vi.mock('@/services/favorites', () => ({ getFavorites: m.getFavorites }));
vi.mock('@/services/auth', () => ({ getSession: m.getSession }));
vi.mock('@/services/listings', () => ({ getListingsByIds: m.getListingsByIds }));
vi.mock('@/context/FavoritesContext', () => ({
  useFavorites: () => ({ favorites: m.favorites, refresh: m.refresh }),
}));
vi.mock('@/features/favorites/FavoritesScreenHeader', () => ({
  FavoritesScreenHeader: ({ count }: { count: number }) =>
    React.createElement('FavoritesScreenHeader', { count }),
  FAVORITES_MARKETPLACE_SURFACE: '#0B4D3C',
}));
vi.mock('@/theme', () => ({
  colors: { surface: '#fff', error: 'red', primary: 'green', textSecondary: '#666', background: '#f5f5f5' },
  spacing: { xl: 24, screenHorizontal: 16, sm: 8, base: 12, md: 16, lg: 20, '3xl': 48 },
  typography: { base: {}, sm: {} },
  fontWeights: { bold: '700' },
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const listing = (id: string) => ({ id, title: id, price: 100, city: 'Douala', images: [] });

beforeEach(() => {
  vi.clearAllMocks();
  m.favorites = new Set();
  m.getSession.mockResolvedValue({ user: { id: 'user-1' } });
  m.refresh.mockResolvedValue(undefined);
  m.getListingsByIds.mockResolvedValue({ data: [], error: null });
});

async function renderScreen() {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(<FavoritesScreen />);
    await Promise.resolve();
    await Promise.resolve();
  });
  return tree;
}

describe('FavoritesScreen', () => {
  it('shows error retry instead of empty when loading fails', async () => {
    m.getFavorites.mockResolvedValue({ data: null, error: { message: 'network' } });
    const tree = await renderScreen();
    expect(tree.root.findAllByType('EmptyState' as unknown as React.ComponentType)).toHaveLength(1);
    expect(m.refresh).toHaveBeenCalled();
  });

  it('shows empty_none when user has no favorites registered', async () => {
    m.getFavorites.mockResolvedValue({ data: [], error: null });
    const tree = await renderScreen();
    expect(tree.root.findAllByType('EmptyState' as unknown as React.ComponentType)).toHaveLength(1);
    expect(tree.root.findByType('FavoritesScreenHeader' as unknown as React.ComponentType).props.count).toBe(0);
  });

  it('renders grid list with header counter from visible favorites', async () => {
    m.favorites = new Set(['a', 'b']);
    m.getFavorites.mockResolvedValue({ data: [listing('a'), listing('b')], error: null });
    const tree = await renderScreen();
    const list = tree.root.findByType('FlatList' as unknown as React.ComponentType);
    expect(list).toBeTruthy();
    expect(list.props.ListHeaderComponent.props.count).toBe(2);
  });

  it('shows unavailable empty when favorites exist but no active listing is hydrated', async () => {
    m.favorites = new Set(['gone']);
    m.getFavorites.mockResolvedValue({ data: [], error: null });
    const tree = await renderScreen();
    expect(tree.root.findAllByType('EmptyState' as unknown as React.ComponentType)).toHaveLength(1);
    expect(tree.root.findByType('FavoritesScreenHeader' as unknown as React.ComponentType).props.count).toBe(0);
  });
});
