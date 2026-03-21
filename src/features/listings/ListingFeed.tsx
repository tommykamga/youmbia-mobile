import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View, Pressable, Text, ActivityIndicator } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { getPublicListings, type PublicListing } from '@/services/listings';
import { getFavoriteIds, toggleFavorite } from '@/services/favorites';
import { sortListings, type SortOption } from '@/utils/sortListings';
import { ListingCard } from './ListingCard';
import { Loader, EmptyState, SkeletonListingCard, Button } from '@/components';
import { spacing, colors, typography, fontWeights, radius } from '@/theme';
import Ionicons from '@expo/vector-icons/Ionicons';

const PAGE_SIZE = 20;
const INITIAL_NUM_TO_RENDER = 10;
const WINDOW_SIZE = 6;

type FeedState =
  | { status: 'loading' }
  | { status: 'empty' }
  | { status: 'error'; message: string }
  | { status: 'success'; data: PublicListing[] };

export type ListingFeedProps = {
  /** Rendered at the top of the list (e.g. home header). Enables single scroll + reliable pull-to-refresh. */
  listHeaderComponent?: React.ReactElement | null;
};

export function ListingFeed({ listHeaderComponent }: ListingFeedProps) {
  const router = useRouter();
  const [state, setState] = useState<FeedState>({ status: 'loading' });
  const [sortBy, setSortBy] = useState<SortOption>('recent');
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);
  const hasLoadedListingsRef = useRef(false);
  const loadingMoreRef = useRef(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const hasMoreRef = useRef(true);
  const favoriteIdsRef = useRef<Set<string>>(new Set());
  favoriteIdsRef.current = favoriteIds;

  const load = useCallback(async (pageOffset: number = 0, append: boolean = false) => {
    const listResult = await getPublicListings(pageOffset, PAGE_SIZE);
    if (listResult.error) {
      if (!append) setState({ status: 'error', message: listResult.error.message });
      else setLoadMoreError(listResult.error.message);
      return;
    }
    const list = listResult.data ?? [];
    if (append) {
      setLoadMoreError(null);
      setState((prev) => {
        if (prev.status !== 'success') return prev;
        const seen = new Set(prev.data.map((i) => i.id));
        const added = list.filter((i) => !seen.has(i.id));
        if (added.length === 0) return prev;
        return { status: 'success' as const, data: [...prev.data, ...added] };
      });
      const isLastPage = list.length < PAGE_SIZE;
      hasMoreRef.current = !isLastPage;
      setHasMore(!isLastPage);
    } else {
      setLoadMoreError(null);
      const favResult = await getFavoriteIds();
      if (favResult.data) setFavoriteIds(new Set(favResult.data));
      setState(
        list.length === 0
          ? { status: 'empty' }
          : { status: 'success', data: list }
      );
      hasMoreRef.current = true;
      setHasMore(true);
    }
  }, []);

  /** Load listings only once on mount. Ref guards against strict-mode double mount. */
  useEffect(() => {
    if (hasLoadedListingsRef.current) return;
    hasLoadedListingsRef.current = true;
    let cancelled = false;
    load(0, false).then(() => {
      if (!cancelled) setRefreshing(false);
    });
    return () => { cancelled = true; };
  }, [load]);

  /** On focus: refresh only favorite state (lightweight). Do not reload listings — preserves scroll position. */
  const refreshFavorites = useCallback(async () => {
    const res = await getFavoriteIds();
    if (res.data) setFavoriteIds(new Set(res.data));
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshFavorites();
    }, [refreshFavorites])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load(0, false).finally(() => setRefreshing(false));
  }, [load]);

  const handleFavoritePress = useCallback(
    async (listingId: string) => {
      const nextFavorite = !favoriteIdsRef.current.has(listingId);
      setFavoriteIds((prev) => {
        const next = new Set(prev);
        if (nextFavorite) next.add(listingId);
        else next.delete(listingId);
        return next;
      });
      const result = await toggleFavorite(listingId);
      if (result.error) {
        setFavoriteIds((prev) => {
          const reverted = new Set(prev);
          if (nextFavorite) reverted.delete(listingId);
          else reverted.add(listingId);
          return reverted;
        });
        if (result.error.message === 'Non connecté') {
          router.replace(`/(auth)/login?redirect=${encodeURIComponent('/(tabs)/home')}`);
        }
        return;
      }
    },
    [router]
  );

  const keyExtractor = useCallback((item: any) => String(item.id ?? item), []);
  const renderItem = useCallback(
    ({ item }: { item: any }) => {
      if (typeof item === 'number') {
        return <SkeletonListingCard />;
      }
      const listing = item as PublicListing;
      return (
        <ListingCard
          listing={listing}
          isFavorite={favoriteIdsRef.current.has(listing.id)}
          onFavoritePress={() => handleFavoritePress(listing.id)}
        />
      );
    },
    [handleFavoritePress]
  );
  const itemSeparator = useCallback(
    () => <View style={styles.separator} />,
    []
  );

  const loadMore = useCallback(() => {
    if (state.status !== 'success' || loadingMoreRef.current || !hasMoreRef.current) return;
    const currentLength = state.data.length;
    if (currentLength === 0) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    load(currentLength, true).finally(() => {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    });
  }, [state.status, state.status === 'success' ? state.data.length : 0, load]);

  const sortedListings = useMemo(() => {
    const list = state.status === 'success' ? state.data : [];
    return sortListings(list, sortBy);
  }, [state.status, state.status === 'success' ? state.data : null, sortBy]);

  const feedData = useMemo(() => {
    if (state.status === 'loading') return [1, 2, 3, 4, 5, 6];
    return sortedListings;
  }, [state.status, sortedListings]);

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
          message={state.message}
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
  }, [state.status, state.status === 'error' ? state.message : null, load]);

  const listFooter = useMemo(() => {
    const dataLength = state.status === 'success' ? state.data.length : 0;
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
  }, [state.status, state.status === 'success' ? state.data.length : 0, loadingMore, hasMore, loadMoreError, load]);

  /* No key prop on FlatList — preserves scroll position when returning from listing detail. */
  return (
    <FlatList
      data={feedData}
      extraData={favoriteIds}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      ItemSeparatorComponent={itemSeparator}
      ListHeaderComponent={listHeader}
      ListFooterComponent={listFooter}
      ListEmptyComponent={listEmpty}
      contentContainerStyle={styles.listContent}
      showsVerticalScrollIndicator={false}
      initialNumToRender={INITIAL_NUM_TO_RENDER}
      maxToRenderPerBatch={6}
      windowSize={WINDOW_SIZE}
      removeClippedSubviews
      onEndReached={loadMore}
      onEndReachedThreshold={0.4}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.primary}
        />
      }
    />
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
  },
  listContent: {
    padding: spacing.base,
    paddingBottom: spacing['3xl'],
    flexGrow: 1,
  },
  separator: {
    height: spacing.base,
  },
  sortContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
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
});
