import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  View,
  Pressable,
  Text,
  ActivityIndicator,
  Platform,
  InteractionManager,
  PixelRatio,
  useWindowDimensions,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { useScrollToTop } from '@react-navigation/native';
import { useFocusEffect } from 'expo-router';
import { getPublicListings, type PublicListing } from '@/services/listings';
import { orderDiscoveryListings, type DiscoverySortOption } from './discoveryDisplay';
import { ListingCard } from './ListingCard';
import { EmptyState, SkeletonListingCard, Button } from '@/components';
import { spacing, colors, typography, fontWeights, radius, ui } from '@/theme';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFavorites } from '@/context/FavoritesContext';
import { lightCacheKeys, lightCacheRead, lightCacheWrite } from '@/lib/lightCache';
import { trackHomeFeedViewed } from '@/lib/analytics';
import { createDiscoveryFeedController, type DiscoveryPage, type DiscoveryFeedCache } from './discoveryFeedController';
import {
  getHomeFeedColumnCount,
  getHomeFeedGridCellLayout,
  getHomeFeedGridInnerWidth,
  HOME_FEED_GRID_COLUMN_GAP,
} from '@/lib/responsiveLayout';
import { buildHomeFeedGridRows, type HomeFeedGridRow } from './homeFeedGridRows';

const PAGE_SIZE = 15;
const FAVORITES_FOCUS_REFRESH_MIN_INTERVAL_MS = 120_000;

const INITIAL_NUM_TO_RENDER = Platform.OS === 'ios' ? 8 : 10;
const WINDOW_SIZE = Platform.OS === 'ios' ? 5 : 10;

export type ListingFeedProps = {
  /** Explicit local development preview; never shares the normal cache or analytics. */
  previewProvider?: { loadPage: (offset: number, limit: number) => Promise<DiscoveryPage<PublicListing>> };
  renderPreviewCard?: (listing: PublicListing, grid: boolean) => React.ReactElement;

  /** Rendered at the top of the list (e.g. home header). Enables single scroll + reliable pull-to-refresh. */
  listHeaderComponent?: React.ReactElement | null;
  /** Padding horizontal du contenu liste (hors mode home item-inset). */
  contentPaddingHorizontal?: number;
  /**
   * Marge latérale des cartes home uniquement (items + tri + pied de liste).
   * Le conteneur FlatList reste sans padding horizontal pour ne pas réduire les rails du header.
   */
  homeFeedCardInset?: number;
  /** Présentation carte fil d’accueil (home uniquement aujourd’hui). */
  listingCardFeedPresentation?: 'standard' | 'home';
  /**
   * Home uniquement : `Animated.FlatList` + handler Reanimated (header / sticky search).
   * Inchangé pour les autres consommateurs éventuels.
   */
  reanimatedScrollHandler?: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  /** Composant optionnel à intercaler dans le flux. */
  extraComponent?: React.ReactElement | null;
  /** Index (après combien d'items) intercaler le composant (défaut 6). */
  extraComponentIndex?: number;
  /** Taille de page réseau (défaut 15). Home peut passer 6 pour limiter l’egress. */
  fetchPageSize?: number;
  /**
   * Si le cache `lightCacheKeys.homeFeedPublic` est plus récent que ce délai (ms),
   * ne pas relancer `getPublicListings` au montage (pull-to-refresh recharge toujours).
   */
  skipNetworkRevalidateWithinMs?: number;
  /** Surcharge `initialNumToRender` FlatList (listes courtes Home). */
  listInitialNumToRender?: number;
  /**
   * Marge basse supplémentaire (ex. hauteur tab bar + safe area) pour que le dernier item ne soit pas masqué.
   */
  contentBottomInset?: number;
  /**
   * Optional external ref to the underlying FlatList.
   * Useful when a parent needs to scroll the feed to top (e.g. tap search bar).
   */
  externalScrollRef?: React.MutableRefObject<any | null>;
};

export function ListingFeed({
  previewProvider,
  renderPreviewCard,
  listHeaderComponent,
  contentPaddingHorizontal = spacing.screenHorizontal,
  homeFeedCardInset,
  listingCardFeedPresentation = 'standard',
  reanimatedScrollHandler,
  extraComponent,
  extraComponentIndex = 6,
  fetchPageSize,
  skipNetworkRevalidateWithinMs,
  listInitialNumToRender,
  contentBottomInset = 0,
  externalScrollRef,
}: ListingFeedProps) {
  const { width: windowWidth } = useWindowDimensions();
  const fontScale = PixelRatio.getFontScale();
  const homeFeedColumns =
    listingCardFeedPresentation === 'home'
      ? getHomeFeedColumnCount(windowWidth, fontScale)
      : 1;
  const useHomeGrid = listingCardFeedPresentation === 'home' && homeFeedColumns === 2;
  const homeGridInnerWidth = useMemo(
    () => getHomeFeedGridInnerWidth(windowWidth),
    [windowWidth]
  );

  const listRef = useRef<any>(null);
  useScrollToTop(listRef);
  const setListNode = useCallback(
    (node: any | null) => {
      listRef.current = node;
      if (externalScrollRef) externalScrollRef.current = node;
    },
    [externalScrollRef]
  );

  const { refresh: refreshFavorites } = useFavorites();
  const [sortBy, setSortBy] = useState<DiscoverySortOption>('discovery');
  const lastFavoritesFocusRefreshRef = useRef(0);

  const effectivePageSize = fetchPageSize ?? PAGE_SIZE;

  const controller = useMemo(() => createDiscoveryFeedController<PublicListing>(
    effectivePageSize,
    async (offset, size) => {
      if (previewProvider) return previewProvider.loadPage(offset, size);
      const result = await getPublicListings(offset, size);
      if (result.error) throw new Error(result.error.message);
      return result;
    },
    cache => { if (previewProvider) return; void lightCacheWrite<DiscoveryFeedCache<PublicListing>>(
      lightCacheKeys.homeFeedPublic, cache,
    ).catch(() => {}); },
  ), [effectivePageSize, previewProvider]);
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const { refreshing, loadingMore, hasMore, loadMoreError } = state;
  const feedSuccessData = state.data;
  const feedDataLength = state.data.length;
  const errorMessage = state.message;

  useEffect(() => {
    const generation = controller.generation();
    void (async () => {
      const snap = previewProvider ? null : await lightCacheRead<unknown>(lightCacheKeys.homeFeedPublic);
      if (generation !== controller.generation()) return;
      const compatible = controller.restoreCache(snap?.payload);
      const skipNetwork = compatible && skipNetworkRevalidateWithinMs != null &&
        snap != null && snap.ageMs < skipNetworkRevalidateWithinMs;
      if (!skipNetwork) await controller.refresh();
    })();
    return controller.cancel;
  }, [controller, skipNetworkRevalidateWithinMs, previewProvider]);

  useFocusEffect(
    useCallback(() => {
      if (previewProvider) return;
      const now = Date.now();
      if (now - lastFavoritesFocusRefreshRef.current < FAVORITES_FOCUS_REFRESH_MIN_INTERVAL_MS) {
        return;
      }
      lastFavoritesFocusRefreshRef.current = now;
      const task = InteractionManager.runAfterInteractions(() => {
        void refreshFavorites();
      });
      return () => task.cancel();
    }, [refreshFavorites, previewProvider])
  );

  useFocusEffect(
    useCallback(() => {
      if (previewProvider || listingCardFeedPresentation !== 'home') return;
      trackHomeFeedViewed({ feed_context: 'default', favorites_only: false });
    }, [listingCardFeedPresentation, previewProvider])
  );

  const onRefresh = useCallback(() => {
    void controller.refresh().then(() => {
      if (!previewProvider && listingCardFeedPresentation === 'home') {
        trackHomeFeedViewed({ feed_context: 'refresh', favorites_only: false });
      }
    });
  }, [controller, listingCardFeedPresentation, previewProvider]);

  const isHomeCardInset =
    listingCardFeedPresentation === 'home' && homeFeedCardInset != null;
  const homeCardInset = homeFeedCardInset ?? spacing.screenHorizontal;
  const homeInsetStyle = useMemo(
    () => (isHomeCardInset ? { paddingHorizontal: homeCardInset } : null),
    [isHomeCardInset, homeCardInset]
  );

  const wrapHomeFeedItem = useCallback(
    (node: React.ReactElement) =>
      isHomeCardInset ? (
        <View style={[styles.homeFeedItemInset, homeInsetStyle]}>{node}</View>
      ) : (
        node
      ),
    [isHomeCardInset, homeInsetStyle]
  );

  const loadMore = useCallback(() => { void controller.loadMore(); }, [controller]);

  const sortedListings = useMemo(() => {
    const list = feedSuccessData ?? [];
    return orderDiscoveryListings(list, sortBy);
  }, [feedSuccessData, sortBy]);

  const feedData = useMemo(() => {
    if (state.status === 'loading') return [1, 2, 3, 4, 5, 6];

    const list = [...sortedListings];

    if (extraComponent && list.length >= extraComponentIndex) {
      list.splice(extraComponentIndex, 0, { id: 'extra-component-marker', type: 'extra' } as any);
    }
    return list;
  }, [state.status, sortedListings, extraComponent, extraComponentIndex]);

  const homeGridRows = useMemo(() => {
    if (!useHomeGrid) return null;
    return buildHomeFeedGridRows(feedData, homeFeedColumns);
  }, [useHomeGrid, feedData, homeFeedColumns]);

  const renderListingCard = useCallback(
    (listing: PublicListing) => renderPreviewCard ? renderPreviewCard(listing, useHomeGrid) : (
      <ListingCard
        listing={listing}
        feedPresentation={listingCardFeedPresentation}
        homeGridCell={useHomeGrid}
        source={listingCardFeedPresentation === 'home' ? 'home' : 'other'}
      />
    ),
    [listingCardFeedPresentation, useHomeGrid, renderPreviewCard]
  );

  const renderSkeletonCard = useCallback(
    () => <SkeletonListingCard feedPresentation={listingCardFeedPresentation} />,
    [listingCardFeedPresentation]
  );

  const renderGridRow = useCallback(
    ({ item }: { item: HomeFeedGridRow }) => {
      if (item.kind === 'extra') {
        return wrapHomeFeedItem(extraComponent ?? <View />);
      }
      const cellCount = item.cells.length;
      return wrapHomeFeedItem(
        <View style={[styles.homeGridRow, { gap: HOME_FEED_GRID_COLUMN_GAP }]}>
          {item.cells.map((cell) => {
            const cellLayout = getHomeFeedGridCellLayout(
              homeGridInnerWidth,
              homeFeedColumns,
              cellCount
            );
            return (
              <View
                key={typeof cell === 'number' ? `skeleton-${cell}` : cell.id}
                style={[styles.homeGridCell, cellLayout]}
              >
                {typeof cell === 'number' ? renderSkeletonCard() : renderListingCard(cell)}
              </View>
            );
          })}
        </View>
      );
    },
    [
      extraComponent,
      homeFeedColumns,
      homeGridInnerWidth,
      renderListingCard,
      renderSkeletonCard,
      wrapHomeFeedItem,
    ]
  );

  const gridKeyExtractor = useCallback((item: HomeFeedGridRow) => item.key, []);

  const keyExtractor = useCallback((item: any) => String(item.id ?? item), []);
  const renderItem = useCallback(
    ({ item }: { item: any }) => {
      if (typeof item === 'number') {
        return wrapHomeFeedItem(renderSkeletonCard());
      }
      if (item.type === 'extra') {
        return wrapHomeFeedItem(extraComponent ?? <View />);
      }
      return wrapHomeFeedItem(renderListingCard(item as PublicListing));
    },
    [extraComponent, renderListingCard, renderSkeletonCard, wrapHomeFeedItem]
  );
  const itemSeparator = useCallback(
    () => <View style={styles.separator} />,
    []
  );

  const sortHeader = useMemo(
    () => (
      <View style={[styles.sortContainer, homeInsetStyle]}>
        <Pressable
          style={[styles.sortOption, sortBy === 'discovery' && styles.sortOptionActive]}
          onPress={() => setSortBy('discovery')}
        >
          <Text style={[styles.sortOptionText, sortBy === 'discovery' && styles.sortOptionTextActive]}>
            Découvrir
          </Text>
        </Pressable>
        <Pressable
          style={[styles.sortOption, sortBy === 'price_asc' && styles.sortOptionActive]}
          onPress={() => setSortBy('price_asc')}
        >
          <Text style={[styles.sortOptionText, sortBy === 'price_asc' && styles.sortOptionTextActive]}>
            Prix ↑
          </Text>
        </Pressable>
        <Pressable
          style={[styles.sortOption, sortBy === 'price_desc' && styles.sortOptionActive]}
          onPress={() => setSortBy('price_desc')}
        >
          <Text style={[styles.sortOptionText, sortBy === 'price_desc' && styles.sortOptionTextActive]}>
            Prix ↓
          </Text>
        </Pressable>
      </View>
    ),
    [sortBy, homeInsetStyle]
  );

  const listHeader = useMemo(
    () => (
      <>
        {listHeaderComponent}
        {state.status === 'success' && feedData.length > 0 && sortHeader}
      </>
    ),
    [listHeaderComponent, state.status, feedData.length, sortHeader]
  );

  const listEmpty = useMemo(() => {
    if (state.status === 'loading') return null;
    if (state.status === 'error') {
      return (
        <EmptyState
          title="Oups, une erreur est survenue"
          message={errorMessage ?? ''}
          icon={<Ionicons name="alert-circle-outline" size={32} color={colors.error} />}
          action={
            <Button variant="secondary" onPress={() => { void controller.refresh(); }}>
              Réessayer
            </Button>
          }
          style={styles.emptyWrap}
        />
      );
    }
    if (state.status === 'empty') {
      return (
        <EmptyState
          title="Aucune annonce trouvée"
          message="Modifiez vos critères ou revenez plus tard."
          icon={<Ionicons name="search-outline" size={32} color={colors.textMuted} />}
          style={styles.emptyWrap}
        />
      );
    }
    return null;
  }, [state.status, errorMessage, controller]);

  const listFooter = useMemo(() => {
    const dataLength = feedDataLength;
    if (state.status !== 'success' || dataLength === 0) return null;

    if (loadingMore) {
      return (
        <View style={styles.footer}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.footerText}>Chargement…</Text>
        </View>
      );
    }
    if (loadMoreError) {
      return (
        <View style={styles.footer}>
          <Text style={styles.footerError}>
            Impossible de charger la suite des annonces. Vérifiez votre connexion, puis réessayez.
          </Text>
          <Pressable
            style={({ pressed }) => [styles.footerRetry, pressed && styles.footerRetryPressed]}
            onPress={() => { void controller.retry(); }}
            accessibilityRole="button"
            accessibilityLabel="Réessayer le chargement des annonces"
          >
            <Text style={styles.footerRetryText}>Réessayer</Text>
          </Pressable>
        </View>
      );
    }
    if (state.ready && !hasMore && state.status === 'success' && dataLength > 0) {
      return (
        <View style={styles.footerEndWrap}>
          <Ionicons name="checkmark-circle-outline" size={18} color={colors.textTertiary} />
          <Text style={styles.footerEnd}>Toutes les annonces ont été chargées</Text>
        </View>
      );
    }
    return null;
  }, [state.status, feedDataLength, loadingMore, hasMore, loadMoreError, controller, state.ready]);

  const listContentStyle = useMemo(
    () => [
      styles.listContent,
      {
        paddingHorizontal: isHomeCardInset ? 0 : contentPaddingHorizontal,
        paddingBottom: spacing['3xl'] + contentBottomInset,
      },
    ],
    [isHomeCardInset, contentPaddingHorizontal, contentBottomInset]
  );

  const listProps = useMemo(
    () => ({
      data: useHomeGrid && homeGridRows ? homeGridRows : feedData,
      keyExtractor: useHomeGrid ? gridKeyExtractor : keyExtractor,
      renderItem: useHomeGrid ? renderGridRow : renderItem,
      ItemSeparatorComponent: useHomeGrid ? undefined : itemSeparator,
      ListHeaderComponent: listHeader,
      ListFooterComponent: listFooter,
      ListEmptyComponent: listEmpty,
      contentContainerStyle: listContentStyle,
      showsVerticalScrollIndicator: false,
      initialNumToRender: useHomeGrid
        ? Math.max(2, Math.ceil((listInitialNumToRender ?? INITIAL_NUM_TO_RENDER) / 2))
        : listInitialNumToRender ?? INITIAL_NUM_TO_RENDER,
      maxToRenderPerBatch: useHomeGrid ? 4 : 6,
      windowSize: WINDOW_SIZE,
      removeClippedSubviews: Platform.OS === 'ios',
      onEndReached: loadMore,
      onEndReachedThreshold: 0.4,
      refreshControl: (
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.primary}
        />
      ),
    }),
    [
      useHomeGrid,
      homeGridRows,
      feedData,
      gridKeyExtractor,
      keyExtractor,
      renderGridRow,
      renderItem,
      itemSeparator,
      listHeader,
      listFooter,
      listEmpty,
      listContentStyle,
      loadMore,
      listInitialNumToRender,
      refreshing,
      onRefresh,
    ]
  );

  /* No key prop on FlatList — preserves scroll position when returning from listing detail. */
  if (reanimatedScrollHandler) {
    return (
      <Animated.FlatList
        ref={setListNode}
        {...(listProps as any)}
        style={styles.listFlex}
        onScroll={reanimatedScrollHandler}
        scrollEventThrottle={16}
      />
    );
  }

  return <FlatList ref={setListNode} {...(listProps as any)} style={styles.listFlex} />;
}

const styles = StyleSheet.create({
  listFlex: {
    flex: 1,
  },
  center: {
    flex: 1,
  },
  listContent: {
    paddingTop: 0,
    flexGrow: 1,
  },
  homeFeedItemInset: {
    width: '100%',
    alignSelf: 'center',
  },
  homeGridRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    width: '100%',
    marginBottom: HOME_FEED_GRID_COLUMN_GAP,
  },
  homeGridCell: {
    flex: 1,
    minWidth: 0,
  },
  separator: {
    height: ui.spacing.md,
  },
  sortContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: spacing.screenHorizontal,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(15,23,42,0.08)',
  },
  sortOption: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.07)',
    backgroundColor: colors.surface,
  },
  sortOptionActive: {
    backgroundColor: colors.primary + '10',
    borderColor: colors.primary + '26',
  },
  sortOptionText: {
    ...typography.sm,
    color: colors.textMuted,
    fontWeight: fontWeights.medium,
  },
  sortOptionTextActive: {
    color: colors.primary,
    fontWeight: fontWeights.semibold,
  },
  footer: {
    paddingVertical: spacing['2xl'],
    paddingHorizontal: spacing.screenHorizontal,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
  },
  footerText: {
    ...typography.xs,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
  footerError: {
    ...typography.sm,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  footerRetry: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.screenHorizontal,
  },
  footerRetryPressed: {
    opacity: 0.8,
  },
  footerRetryText: {
    ...typography.sm,
    fontWeight: fontWeights.semibold,
    color: colors.primary,
  },
  footerEndWrap: {
    paddingVertical: spacing['2xl'],
    paddingHorizontal: spacing.screenHorizontal,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  footerEnd: {
    ...typography.xs,
    color: colors.textTertiary,
  },
  emptyWrap: {
    marginTop: spacing['2xl'],
  },
});
