import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ListingGallery, LISTING_GALLERY_PLACEHOLDER_HEIGHT } from './ListingGallery';

const runtime = vi.hoisted(() => ({ width: 400, height: 800, resolve: vi.fn(), scrollTo: vi.fn() }));
vi.mock('react-native', () => ({
  Platform: { OS: 'ios', select: (s: { ios?: unknown; default?: unknown }) => s.ios ?? s.default },
  View: 'View', ScrollView: 'ScrollView', FlatList: 'FlatList', Image: 'Image', Text: 'Text',
  Pressable: 'Pressable', Modal: 'Modal', ActivityIndicator: 'ActivityIndicator',
  StyleSheet: { create: (s: unknown) => s, absoluteFill: {} },
  useWindowDimensions: () => ({ width: runtime.width, height: runtime.height }),
}));
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 40, bottom: 24 }) }));
vi.mock('@expo/vector-icons/Ionicons', () => ({ default: 'Icon' }));
vi.mock('@/lib/listingImageUrl', () => ({ resolveSingleListingImageUrl: runtime.resolve }));
vi.mock('@/lib/analytics', () => ({ trackListingGallerySwiped: vi.fn() }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function nodes(r: ReactTestRenderer, type: string) { return r.root.findAll(n => n.type === type); }
function mount(
  images = ['one', 'two', 'three', 'four'],
  lazySourcePaths?: string[],
  extra?: { onBackPress?: () => void; onFavoritePress?: () => void; onSharePress?: () => void }
) {
  let renderer!: ReactTestRenderer;
  act(() => { renderer = create(<ListingGallery images={images} lazySourcePaths={lazySourcePaths} {...extra} />, {
    createNodeMock: e => e.type === 'ScrollView' ? { scrollTo: runtime.scrollTo } : null,
  }); });
  return renderer;
}
function textOf(node: { props: { children?: unknown } }): string {
  const children = node.props.children;
  if (Array.isArray(children)) return children.map((part) => (Array.isArray(part) ? part.join('') : String(part ?? ''))).join('');
  return children == null ? '' : String(children);
}
function open(r: ReactTestRenderer, index: number) { act(() => nodes(r, 'Pressable')[index].props.onPress()); }
function swipe(r: ReactTestRenderer, index: number) {
  act(() => nodes(r, 'FlatList')[0].props.onScroll({ nativeEvent: { contentOffset: { x: index * runtime.width } } }));
}
function count(r: ReactTestRenderer) {
  const modal = nodes(r, 'Modal')[0];
  return modal.findAll(n => String(n.type) === 'Text').map(n => n.props.children.flat?.().join('') ?? n.props.children);
}

describe('full screen listing photos', () => {
  beforeEach(() => { vi.clearAllMocks(); runtime.width = 400; runtime.height = 800; });
  it('AC01–AC06: opens 2/4, pages both ways, clamps edges and closes at the active photo', () => {
    const r = mount(); open(r, 1);
    expect(nodes(r, 'FlatList')[0].props.initialScrollIndex).toBe(1);
    expect(count(r)).toContain('2 / 4');
    for (const index of [2, 3, 2, 1]) { swipe(r, index); expect(count(r)).toContain(`${index + 1} / 4`); }
    swipe(r, -1); expect(count(r)).toContain('1 / 4');
    swipe(r, 8); expect(count(r)).toContain('4 / 4');
    const list = nodes(r, 'FlatList')[0];
    expect(list.props).toMatchObject({ horizontal: true, pagingEnabled: true, bounces: false, overScrollMode: 'never' });
    act(() => r.root.find(n => n.props.accessibilityLabel === 'Fermer les photos').props.onPress());
    expect(nodes(r, 'Modal')[0].props.visible).toBe(false);
    expect(runtime.scrollTo).toHaveBeenLastCalledWith({ x: 1200, animated: false });
    expect(nodes(r, 'ScrollView')[0].props.pagingEnabled).toBe(true);
    open(r, 3); expect(count(r)).toContain('4 / 4');
    act(() => nodes(r, 'Modal')[0].props.onRequestClose());
    expect(nodes(r, 'Modal')[0].props.visible).toBe(false);
    act(() => r.unmount());
  });
  it('handles rapid consecutive scroll events and closing before the next render', () => {
    const r = mount(); open(r, 0);
    const onScroll = nodes(r, 'FlatList')[0].props.onScroll;
    const close = nodes(r, 'Modal')[0].props.onRequestClose;
    act(() => {
      for (const x of [400, 800, 1200, 800, 400]) onScroll({ nativeEvent: { contentOffset: { x } } });
      close();
    });
    expect(runtime.scrollTo).toHaveBeenLastCalledWith({ x: 400, animated: false });
    expect(nodes(r, 'Modal')[0].props.visible).toBe(false);
    act(() => r.unmount());
  });
  it('AC07: single photo has no full screen counter; an empty gallery stays usable', () => {
    const r = mount(['single']); open(r, 0); expect(count(r)).toEqual([]);
    expect(nodes(r, 'FlatList')[0].props.data).toEqual([0]);
    act(() => r.unmount());
    const empty = mount([]); expect(nodes(empty, 'Modal')).toHaveLength(0); act(() => empty.unmount());
  });
  it('keeps the selected index when orientation changes and resets for a new photo set', () => {
    const images = ['one', 'two', 'three', 'four']; const r = mount(images); open(r, 2);
    runtime.width = 800; runtime.height = 400;
    act(() => r.update(<ListingGallery images={images} />));
    expect(nodes(r, 'FlatList')[0].props.getItemLayout(null, 2)).toEqual({ length: 800, offset: 1600, index: 2 });
    expect(count(r)).toContain('3 / 4');
    act(() => r.update(<ListingGallery images={['new']} />));
    expect(nodes(r, 'Modal')[0].props.visible).toBe(false);
    act(() => r.unmount());
  });
  it('opens a slow lazy photo immediately, deduplicates signing and displays a failure without closing', async () => {
    let resolve!: (url: string | null) => void;
    runtime.resolve.mockImplementation(() => new Promise<string | null>(done => { resolve = done; }));
    const r = mount(['first'], ['storage/path']); open(r, 1);
    expect(count(r)).toContain('2 / 2'); expect(runtime.resolve).toHaveBeenCalledTimes(1);
    await act(async () => { resolve(null); });
    const photo = nodes(r, 'FlatList')[0].props.renderItem({ item: 1 });
    expect(photo.props.unavailable).toBe(true);
    let image!: ReactTestRenderer; act(() => { image = create(photo); });
    expect(nodes(image, 'Text')[0].props.children).toBe('Photo indisponible');
    expect(nodes(r, 'Modal')[0].props.visible).toBe(true);
    act(() => { image.unmount(); r.unmount(); });
  });
  it('preserves image proportions and handles image loading errors', () => {
    const r = mount(); open(r, 0);
    const photo = nodes(r, 'FlatList')[0].props.renderItem({ item: 0 });
    let image!: ReactTestRenderer; act(() => { image = create(photo); });
    expect(nodes(image, 'Image')[0].props.resizeMode).toBe('contain');
    expect(nodes(image, 'ScrollView')[0].props.maximumZoomScale).toBe(3);
    act(() => nodes(image, 'ScrollView')[0].props.onScroll({ nativeEvent: { zoomScale: 2 } }));
    expect(nodes(r, 'FlatList')[0].props.scrollEnabled).toBe(false);
    act(() => nodes(image, 'ScrollView')[0].props.onScroll({ nativeEvent: { zoomScale: 1 } }));
    expect(nodes(r, 'FlatList')[0].props.scrollEnabled).toBe(true);
    expect(nodes(image, 'ActivityIndicator')).toHaveLength(1);
    act(() => nodes(image, 'Image')[0].props.onError());
    expect(nodes(image, 'Text')[0].props.children).toBe('Photo indisponible');
    act(() => { image.unmount(); r.unmount(); });
  });
  it('shows each photo in full and a counter only when several photos exist', () => {
    const single = mount(['only']);
    expect(nodes(single, 'Image')[0].props.resizeMode).toBe('contain');
    expect(nodes(single, 'Text').map(textOf).join(' ')).not.toContain('1 / 1');
    act(() => single.unmount());
    const many = mount();
    expect(nodes(many, 'Image')[0].props.resizeMode).toBe('contain');
    expect(nodes(many, 'Text').map(textOf)).toContain('1 / 4');
    act(() => many.unmount());
  });
  it('uses a compact height when there are no photos', () => {
    const empty = mount([]);
    const container = nodes(empty, 'View')[0];
    expect(container.props.style).toEqual(expect.arrayContaining([expect.objectContaining({ height: LISTING_GALLERY_PLACEHOLDER_HEIGHT })]));
    act(() => empty.unmount());
  });
  it('keeps the first photo press ahead of the floating back and favorite controls', () => {
    const back = vi.fn();
    const favorite = vi.fn();
    const share = vi.fn();
    const r = mount(['one', 'two'], undefined, { onBackPress: back, onFavoritePress: favorite, onSharePress: share });
    act(() => nodes(r, 'Pressable')[0].props.onPress());
    expect(nodes(r, 'FlatList')[0].props.initialScrollIndex).toBe(0);
    act(() => r.root.find((n) => n.props.accessibilityLabel === 'Retour').props.onPress());
    act(() => r.root.find((n) => n.props.accessibilityLabel === 'Ajouter aux favoris').props.onPress());
    act(() => r.root.find((n) => n.props.accessibilityLabel === "Partager l'annonce").props.onPress());
    expect(back).toHaveBeenCalledTimes(1);
    expect(favorite).toHaveBeenCalledTimes(1);
    expect(share).toHaveBeenCalledTimes(1);
    act(() => r.unmount());
  });
});
