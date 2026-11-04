import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { beforeEach, expect, it, vi } from 'vitest';
import { ListingFeed } from './ListingFeed';

const m = vi.hoisted(() => ({ fetch: vi.fn(), read: vi.fn(), write: vi.fn(), favorites: vi.fn() }));
vi.mock('react-native', () => ({
  Platform: { OS: 'ios' }, FlatList: 'FlatList', RefreshControl: 'RefreshControl',
  View: 'View', Text: 'Text', Pressable: 'Pressable', ActivityIndicator: 'ActivityIndicator',
  StyleSheet: { create: (s: unknown) => s, hairlineWidth: 1 },
  InteractionManager: { runAfterInteractions: () => ({ cancel: vi.fn() }) },
  useWindowDimensions: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 }),
  PixelRatio: { getFontScale: () => 1 },
}));
vi.mock('react-native-reanimated', () => ({ default: { FlatList: 'AnimatedFlatList' } }));
vi.mock('@react-navigation/native', () => ({ useScrollToTop: vi.fn() }));
vi.mock('expo-router', () => ({ useFocusEffect: vi.fn() }));
vi.mock('@expo/vector-icons/Ionicons', () => ({ default: 'Icon' }));
vi.mock('@/components', () => ({ EmptyState: 'EmptyState', SkeletonListingCard: 'Skeleton', Button: 'Button' }));
vi.mock('./ListingCard', () => ({ ListingCard: 'ListingCard' }));
vi.mock('@/services/listings', () => ({ getPublicListings: m.fetch }));
vi.mock('@/context/FavoritesContext', () => ({ useFavorites: () => ({ refresh: m.favorites }) }));
vi.mock('@/lib/analytics', () => ({ trackHomeFeedViewed: vi.fn() }));
vi.mock('@/lib/lightCache', () => ({ lightCacheKeys: { homeFeedPublic: 'home' }, lightCacheRead: m.read, lightCacheWrite: m.write }));
vi.mock('@/theme', () => ({
  colors: {}, spacing: {}, radius: {}, typography: {}, fontWeights: {}, ui: { spacing: {} },
}));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const result = (ids: string[], nextOffset: number, hasMore: boolean) => ({
  data: ids.map(id => ({ id })), error: null, pagination: { nextOffset, hasMore },
});
const list = (r: ReactTestRenderer) => r.root.find(n => String(n.type) === 'FlatList');
beforeEach(() => { vi.clearAllMocks(); m.read.mockResolvedValue(null); m.write.mockResolvedValue(undefined); });

it('wires cached pagination to a virtualized stable list and serializes endReached', async () => {
  m.read.mockResolvedValue({ ageMs: 100, payload: {
    listings: [{ id: 'a' }, { id: 'b' }], paginationVersion: 1, pageSize: 2, nextOffset: 2, hasMore: true,
  } });
  let resolve!: (value: ReturnType<typeof result>) => void;
  m.fetch.mockImplementation(() => new Promise(done => { resolve = done; }));
  let r!: ReactTestRenderer;
  await act(async () => { r = create(<ListingFeed fetchPageSize={2} skipNetworkRevalidateWithinMs={120000} />); });
  expect(m.fetch).not.toHaveBeenCalled();
  const originalList = list(r);
  expect(originalList.props).toMatchObject({ onEndReachedThreshold: 0.4, maxToRenderPerBatch: 6, windowSize: 5 });
  act(() => { list(r).props.onEndReached(); list(r).props.onEndReached(); });
  expect(m.fetch.mock.calls).toEqual([[2, 2]]);
  expect(list(r).props.data.map((x: { id: string }) => x.id)).toEqual(['a', 'b']);
  await act(async () => { resolve(result(['c'], 3, false)); });
  expect(list(r)).toBe(originalList);
  expect(list(r).props.data.map((x: { id: string }) => x.id)).toEqual(['a', 'b', 'c']);
  act(() => { r.update(<ListingFeed fetchPageSize={2} skipNetworkRevalidateWithinMs={120000} listHeaderComponent={<React.Fragment />} />); });
  expect(list(r)).toBe(originalList); expect(m.fetch).toHaveBeenCalledTimes(1);
  act(() => r.unmount());
});

it('revalidates a legacy cache in StrictMode and ignores the old next page after unmount', async () => {
  m.read.mockResolvedValue({ ageMs: 100, payload: { listings: [{ id: 'legacy' }] } });
  m.fetch.mockResolvedValueOnce(result(['a', 'b'], 2, true));
  let resolve!: (value: ReturnType<typeof result>) => void;
  m.fetch.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  let r!: ReactTestRenderer;
  await act(async () => { r = create(<React.StrictMode><ListingFeed fetchPageSize={2} skipNetworkRevalidateWithinMs={120000} /></React.StrictMode>); });
  expect(m.fetch.mock.calls).toEqual([[0, 2]]);
  expect(list(r).props.data.map((x: { id: string }) => x.id)).toEqual(['a', 'b']);
  act(() => list(r).props.onEndReached());
  act(() => r.unmount());
  await act(async () => { resolve(result(['stale'], 3, false)); });
  expect(m.write).toHaveBeenCalledTimes(1);
  expect(m.write.mock.calls[0][1].listings).toEqual([{ id: 'a' }, { id: 'b' }]);
});

it('presents a readable next-page error and keeps the same list through an explicit retry', async () => {
  m.fetch.mockResolvedValueOnce(result(['a', 'b'], 2, true))
    .mockResolvedValueOnce({ data: null, error: { message: 'TypeError: Network request failed' } })
    .mockResolvedValueOnce(result(['c'], 3, false));
  let r!: ReactTestRenderer;
  await act(async () => { r = create(<ListingFeed fetchPageSize={2} />); });
  const originalList = list(r);
  await act(async () => list(r).props.onEndReached());
  expect(list(r)).toBe(originalList);
  expect(list(r).props.data.map((x: { id: string }) => x.id)).toEqual(['a', 'b']);
  const footer = list(r).props.ListFooterComponent;
  expect(footer.props.children[0].props.children).toBe(
    'Impossible de charger la suite des annonces. Vérifiez votre connexion, puis réessayez.',
  );
  act(() => list(r).props.onEndReached());
  expect(m.fetch).toHaveBeenCalledTimes(2);
  await act(async () => footer.props.children[1].props.onPress());
  expect(m.fetch.mock.calls).toEqual([[0, 2], [2, 2], [2, 2]]);
  expect(list(r)).toBe(originalList);
  expect(list(r).props.data.map((x: { id: string }) => x.id)).toEqual(['a', 'b', 'c']);
  act(() => r.unmount());
});


it('cancels the old home page when leaving for criteria and keeps a fresh feed intact on return', async () => {
  m.fetch.mockResolvedValueOnce(result(['global'], 1, true));
  let resolveOld!: (value: ReturnType<typeof result>) => void;
  m.fetch.mockImplementationOnce(() => new Promise(done => { resolveOld = done; }));
  m.fetch.mockResolvedValueOnce(result(['current'], 1, false));
  let r!: ReactTestRenderer;
  await act(async () => { r = create(<ListingFeed fetchPageSize={1} />); });
  act(() => list(r).props.onEndReached());
  expect(m.fetch.mock.calls).toEqual([[0, 1], [1, 1]]);
  // SearchScreen replaces ListingFeed when search state ceases to be idle.
  // Exercise that real component cleanup, without claiming to render SearchScreen.
  act(() => r.update(<React.Fragment />));
  expect(r.toJSON()).toBeNull();
  await act(async () => { r.update(<ListingFeed fetchPageSize={1} />); });
  const freshList = list(r);
  const freshData = freshList.props.data;
  const writesBeforeOldResponse = m.write.mock.calls.slice();
  await act(async () => { resolveOld(result(['stale-global-page'], 2, false)); });
  expect(list(r)).toBe(freshList);
  expect(list(r).props.data).toBe(freshData);
  expect(freshData.map((x: { id: string }) => x.id)).toEqual(['current']);
  expect(m.write.mock.calls).toEqual(writesBeforeOldResponse);
  expect(m.write.mock.calls.map(([, cache]) => cache.listings)).toEqual([
    [{ id: 'global' }], [{ id: 'current' }],
  ]);
  act(() => r.unmount());
});

it('isolates preview pagination from network and cache, then restores the normal service when removed', async () => {
  const previewProvider = { loadPage: vi.fn().mockResolvedValue({
    data: [{ id: 'home-demo-01' }], pagination: { nextOffset: 1, hasMore: false },
  }) };
  let r!: ReactTestRenderer;
  await act(async () => { r = create(<ListingFeed previewProvider={previewProvider} fetchPageSize={6} />); });
  expect(previewProvider.loadPage).toHaveBeenCalledWith(0, 6);
  expect(m.fetch).not.toHaveBeenCalled(); expect(m.read).not.toHaveBeenCalled(); expect(m.write).not.toHaveBeenCalled();
  m.fetch.mockResolvedValueOnce(result(['real-qa-id'], 1, false));
  await act(async () => { r.update(<ListingFeed fetchPageSize={6} />); });
  expect(m.fetch).toHaveBeenCalledWith(0, 6); expect(m.read).toHaveBeenCalledTimes(1);
  expect(list(r).props.data.map((x: { id: string }) => x.id)).toEqual(['real-qa-id']);
  expect(m.write).toHaveBeenCalledTimes(1);
  expect(m.write.mock.calls[0][1].listings).toEqual([{ id: 'real-qa-id' }]);
  act(() => r.unmount());
});
