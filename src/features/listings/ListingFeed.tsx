import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { useScrollToTop } from '@react-navigation/native';
import { useFocusEffect } from 'expo-router';
import { getPublicListings, type PublicListing } from '@/services/listings';
import { sortListings, type SortOption } from '@/utils/sortListings';
import { ListingCard } from './ListingCard';
import { EmptyState, SkeletonListingCard, Button } from '@/components';
import { spacing, colors, typography, fontWeights, radius, ui } from '@/theme';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFavorites } from '@/context/FavoritesContext';
import { lightCacheKeys, lightCacheRead, lightCacheWrite } from '@/lib/lightCache';

const PAGE_SIZE = 15;
const FAVORITES_FOCUS_REFRESH_MIN_INTERVAL_MS = 120_000;

type HomeFeedCachePayload = { listings: PublicListing[] };
const INITIAL_NUM_TO_RENDER = Platform.OS === 'ios' ? 8 : 10;
const WINDOW_SIZE = Platform.OS === 'ios' ? 5 : 10;

type FeedState =
  | { status: 'loading' }
  | { status: 'empty' }
  | { status: 'error'; message: string }
  | { status: 'success'; data: PublicListing[] };

export type ListingFeedProps = {
  /** Rendered at the top of the list (e.g. home header). Enables single scroll + reliable pull-to-refresh. */
  listHeaderComponent?: React.ReactElement | null;
  /** Padding horizontal du contenu (Home compact = plus étroit). */
  contentPaddingHorizontal?: number;
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
  /** Limite maximale d'annonces à afficher. */
  limit?: number;
  /** Action à afficher en fin de flux (si limité). */
  footerAction?: { label: string; onPress: () => void };
  /** Taille de page réseau (défaut 15). Home peut passer 6 pour limiter l’egress. */
  fetchPageSize?: number;
  /**
   * Si le cache `lightCacheKeys.homeFeedPublic` est plus récent que ce délai (ms),
   * ne pas relancer `getPublicListings` au montage (pull-to-refresh recharge toujours).
   */
  skipNetworkRevalidateWithinMs?: number;
  /** Pas de chargement au scroll du fil (ex. Home plafonné à `limit`). */
  disableInfiniteScroll?: boolean;
  /** Surcharge `initialNumToRender` FlatList (listes courtes Home). */
  listInitialNumToRender?: number;
};

export function ListingFeed({
  listHeaderComponent,
  contentPaddingHorizontal = spacing.base,
  listingCardFeedPresentation = 'standard',
  reanimatedScrollHandler,
  extraComponent,
  extraComponentIndex = 6,
  limit,
  footerAction,
  fetchPageSize,
  skipNetworkRevalidateWithinMs,
  disableInfiniteScroll = false,
  listInitialNumToRender,
}: ListingFeedProps) {
  const listRef = useRef<any>(null);
  useScrollToTop(listRef);

  const { refresh: refreshFavorites } = useFavorites();
  const [state, setState] = useState<FeedState>({ status: 'loading' });
  const [sortBy, setSortBy] = useState<SortOption>('recent');
  const [refreshing, setRefreshing] = useState(false);
  const hasLoadedListingsRef = useRef(false);
  const loadingMoreRef = useRef(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const hasMoreRef = useRef(true);
  const lastFavoritesFocusRefreshRef = useRef(0);

  const effectivePageSize = fetchPageSize ?? PAGE_SIZE;

  const feedSuccessData = state.status === 'success' ? state.data : null;
  const feedDataLength = feedSuccessData?.length ?? 0;
  const errorMessage = state.status === 'error' ? state.message : null;

  const load = useCallback(async (pageOffset: number = 0, append: boolean = false) => {
    const listResult = await getPublicListings(pageOffset, effectivePageSize);
    if (listResult.error) {
      if (!append) {
        setState((prev) => {
          if (prev.status === 'success' && prev.data.length > 0) {
            return prev;
          }
          return { status: 'error', message: listResult.error.message };
        });
      } else setLoadMoreError(listResult.error.message);
      return;
    }
    const list = listResult.data ?? [];
    const reachedEnd = list.length < effectivePageSize;
    if (append) {
      setLoadMoreError(null);
      if (reachedEnd) {
        hasMoreRef.current = false;
        setHasMore(false);
      }
      setState((prev) => {
        if (prev.status !== 'success') return prev;
        const seen = new Set(prev.data.map((i) => i.id));
        const added = list.filter((i) => !seen.has(i.id));
        if (added.length === 0) return prev;
        return { status: 'success' as const, data: [...prev.data, ...added] };
      });
    } else {
      setLoadMoreError(null);
      setState(
        list.length === 0
          ? { status: 'empty' }
          : { status: 'success', data: list }
      );
      if (disableInfiniteScroll) {
        hasMoreRef.current = false;
        setHasMore(false);
      } else {
        hasMoreRef.current = !reachedEnd;
        setHasMore(!reachedEnd);
      }
      if (list.length > 0) {
        void lightCacheWrite<HomeFeedCachePayload>(lightCacheKeys.homeFeedPublic, { listings: list });
      }
    }
  }, [disableInfiniteScroll, effectivePageSize]);

  /** Load listings only once on mount. Ref guards against strict-mode double mount. */
  useEffect(() => {
    if (hasLoadedListingsRef.current) return;
    hasLoadedListingsRef.current = true;
    let cancelled = false;
    void (async () => {
      const snap = await lightCacheRead<HomeFeedCachePayload>(lightCacheKeys.homeFeedPublic);
      if (!cancelled && snap?.payload?.listings?.length) {
        setState({ status: 'success', data: snap.payload.listings });
      }
      const skipNetwork =
        skipNetworkRevalidateWithinMs != null &&
        snap != null &&
        snap.payload.listings.length > 0 &&
        snap.ageMs < skipNetworkRevalidateWithinMs;
      if (!cancelled && skipNetwork) {
        hasMoreRef.current = false;
        setHasMore(false);
      } else if (!cancelled) {
        await load(0, false);
      }
      if (!cancelled) setRefreshing(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [load, skipNetworkRevalidateWithinMs]);

  useFocusEffect(
    useCallback(() => {
      const now = Date.now();
      if (now - lastFavoritesFocusRefreshRef.current < FAVORITES_FOCUS_REFRESH_MIN_INTERVAL_MS) {
        return;
      }
      lastFavoritesFocusRefreshRef.current = now;
      const task = InteractionManager.runAfterInteractions(() => {
        void refreshFavorites();
      });
      return () => task.cancel();
    }, [refreshFavorites])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load(0, false).finally(() => setRefreshing(false));
  }, [load]);

  const keyExtractor = useCallback((item: any) => String(item.id ?? item), []);
  const renderItem = useCallback(
    ({ item }: { item: any }) => {
      if (typeof item === 'number') {
        return (
          <SkeletonListingCard feedPresentation={listingCardFeedPresentation} />
        );
      }
      if (item.type === 'extra') {
        return extraComponent || null;
      }
      return (
        <ListingCard
          listing={item as PublicListing}
          feedPresentation={listingCardFeedPresentation}
        />
      );
    },
    [listingCardFeedPresentation, extraComponent]
  );
  const itemSeparator = useCallback(
    () => <View style={styles.separator} />,
    []
  );

  const loadMore = useCallback(() => {
    if (state.status !== 'success' || loadingMoreRef.current || !hasMoreRef.current) return;

    const currentLength = feedDataLength;
    if (currentLength === 0) return;

    // Si on a atteint la limite, on ne charge plus
    if (limit && currentLength >= limit) return;

    loadingMoreRef.current = true;
    setLoadingMore(true);
    load(currentLength, true).finally(() => {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    });
  }, [state.status, feedDataLength, load, limit]);

  const sortedListings = useMemo(() => {
    const list = feedSuccessData ?? [];
    return sortListings(list, sortBy);
  }, [feedSuccessData, sortBy]);

  const feedData = useMemo(() => {
    if (state.status === 'loading') return [1, 2, 3, 4, 5, 6];

    let list = [...sortedListings];

    // Application de la limite si présente
    if (limit && list.length > limit) {
      list = list.slice(0, limit);
    }

    if (extraComponent && list.length >= extraComponentIndex) {
      list.splice(extraComponentIndex, 0, { id: 'extra-component-marker', type: 'extra' } as any);
    }
    return list;
  }, [state.status, sortedListings, extraComponent, extraComponentIndex, limit]);

  const sortHeader = useMemo(
    () => (
      <View style={styles.sortContainer}>
        <Pressable
          style={[styles.sortOption, sortBy === 'recent' && styles.sortOptionActive]}
          onPress={() => setSortBy('recent')}
        >
          <Text style={[styles.sortOptionText, sortBy === 'recent' && styles.sortOptionTextActive]}>
            Plus récentes
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
    [sortBy]
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
            <Button variant="secondary" onPress={() => load(0, false)}>
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
  }, [state.status, errorMessage, load]);

  const listFooter = useMemo(() => {
    const dataLength = feedDataLength;
    if (state.status !== 'success' || dataLength === 0) return null;

    // Cas spécifique : Limite atteinte (Home contrôlée)
    if (limit && dataLength >= limit) {
      return (
        <View style={styles.limitFooter}>
          <View style={styles.limitDivider} />
          {footerAction && (
            <Button
              variant="outline"
              onPress={footerAction.onPress}
              style={styles.limitButton}
            >
              {footerAction.label}
            </Button>
          )}
          <View style={styles.footerEndWrap}>
            <Ionicons name="checkmark-circle-outline" size={18} color={colors.textTertiary} />
            <Text style={styles.footerEnd}>Vous avez vu toutes les annonces du moment</Text>
          </View>
        </View>
      );
    }

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
          <Text style={styles.footerError}>{loadMoreError}</Text>
          <Pressable
            style={({ pressed }) => [styles.footerRetry, pressed && styles.footerRetryPressed]}
            onPress={() => {
              setLoadMoreError(null);
              load(dataLength, true);
            }}
          >
            <Text style={styles.footerRetryText}>Réessayer</Text>
          </Pressable>
        </View>
      );
    }
    if (!hasMore && state.status === 'success' && dataLength > 0) {
      return (
        <View style={styles.footerEndWrap}>
          <Ionicons name="checkmark-circle-outline" size={18} color={colors.textTertiary} />
          <Text style={styles.footerEnd}>Toutes les annonces ont été chargées</Text>
        </View>
      );
    }
    return null;
  }, [state.status, feedDataLength, loadingMore, hasMore, loadMoreError, load, limit, footerAction]);

  const listContentStyle = useMemo(
    () => [styles.listContent, { paddingHorizontal: contentPaddingHorizontal }],
    [contentPaddingHorizontal]
  );

  const listProps = useMemo(
    () => ({
      data: feedData,
      keyExtractor,
      renderItem,
      ItemSeparatorComponent: itemSeparator,
      ListHeaderComponent: listHeader,
      ListFooterComponent: listFooter,
      ListEmptyComponent: listEmpty,
      contentContainerStyle: listContentStyle,
      showsVerticalScrollIndicator: false,
      initialNumToRender: listInitialNumToRender ?? INITIAL_NUM_TO_RENDER,
      maxToRenderPerBatch: 6,
      windowSize: WINDOW_SIZE,
      removeClippedSubviews: Platform.OS === 'ios',
      onEndReached: disableInfiniteScroll ? undefined : loadMore,
      onEndReachedThreshold: disableInfiniteScroll ? undefined : 0.4,
      refreshControl: (
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.primary}
        />
      ),
    }),
    [
      feedData,
      keyExtractor,
      renderItem,
      itemSeparator,
      listHeader,
      listFooter,
      listEmpty,
      listContentStyle,
      loadMore,
      disableInfiniteScroll,
      listInitialNumToRender,
      refreshing,
      onRefresh,
    ]
  );

  /* No key prop on FlatList — preserves scroll position when returning from listing detail. */
  if (reanimatedScrollHandler) {
    return (
      <Animated.FlatList
        ref={listRef}
        {...listProps}
        style={styles.listFlex}
        onScroll={reanimatedScrollHandler}
        scrollEventThrottle={16}
      />
    );
  }

  return <FlatList ref={listRef} {...listProps} style={styles.listFlex} />;
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
    paddingBottom: spacing['3xl'],
    flexGrow: 1,
  },
  separator: {
    height: ui.spacing.md,
  },
  sortContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ui.spacing.sm,
    paddingVertical: ui.spacing.sm,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: ui.colors.borderLight,
  },
  sortOption: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.lg,
  },
  sortOptionActive: {
    backgroundColor: colors.primary + '20',
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
    paddingHorizontal: spacing.base,
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
    paddingHorizontal: spacing.base,
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
    paddingHorizontal: spacing.base,
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
  limitFooter: {
    paddingVertical: spacing['3xl'],
    paddingHorizontal: spacing.base,
    alignItems: 'center',
  },
  limitDivider: {
    width: '40%',
    height: 1,
    backgroundColor: colors.borderLight,
    marginBottom: spacing['2xl'],
  },
  limitButton: {
    minWidth: 220,
    marginBottom: spacing.xl,
  },
});
