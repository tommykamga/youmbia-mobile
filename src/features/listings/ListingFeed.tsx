import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { getPublicListings, type PublicListing } from '@/services/listings';
import { getFavoriteIds, toggleFavorite } from '@/services/favorites';
import { ListingCard } from './ListingCard';
import { Loader, EmptyState, SkeletonListingCard } from '@/components';
import { spacing, colors } from '@/theme';

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
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);
  const hasLoadedListingsRef = useRef(false);

  const load = useCallback(async () => {
    const [listResult, favResult] = await Promise.all([
      getPublicListings(),
      getFavoriteIds(),
    ]);
    if (listResult.error) {
      setState({ status: 'error', message: listResult.error.message });
      return;
    }
    const list = listResult.data ?? [];
    setState(
      list.length === 0
        ? { status: 'empty' }
        : { status: 'success', data: list }
    );
    if (favResult.data) {
      setFavoriteIds(new Set(favResult.data));
    }
  }, []);

  /** Load listings only once on mount. Ref guards against strict-mode double mount. */
  useEffect(() => {
    if (hasLoadedListingsRef.current) return;
    hasLoadedListingsRef.current = true;
    let cancelled = false;
    load().then(() => {
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
    load().finally(() => setRefreshing(false));
  }, [load]);

  const handleFavoritePress = useCallback(
    async (listingId: string) => {
      const nextFavorite = !favoriteIds.has(listingId);
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
    [favoriteIds, router]
  );

  const keyExtractor = useCallback((item: PublicListing) => item.id, []);
  const renderItem = useCallback(
    ({ item }: { item: PublicListing }) => (
      <ListingCard
        listing={item}
        isFavorite={favoriteIds.has(item.id)}
        onFavoritePress={() => handleFavoritePress(item.id)}
      />
    ),
    [favoriteIds, handleFavoritePress]
  );
  const itemSeparator = useCallback(
    () => <View style={styles.separator} />,
    []
  );

  if (state.status === 'loading') {
    return (
      <FlatList
        data={[1, 2, 3, 4, 5, 6]}
        keyExtractor={(key) => String(key)}
        renderItem={() => <SkeletonListingCard />}
        ItemSeparatorComponent={itemSeparator}
        ListHeaderComponent={listHeaderComponent ?? null}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
    );
  }

  if (state.status === 'error') {
    return (
      <View style={styles.center}>
        {listHeaderComponent}
        <EmptyState
          title="Erreur"
          message={state.message}
          style={styles.center}
        />
      </View>
    );
  }

  if (state.status === 'empty') {
    return (
      <View style={styles.center}>
        {listHeaderComponent}
        <EmptyState
          title="Aucune annonce disponible"
          style={styles.center}
        />
      </View>
    );
  }

  /* No key prop on FlatList — preserves scroll position when returning from listing detail. */
  return (
    <FlatList
      data={state.data}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      ItemSeparatorComponent={itemSeparator}
      ListHeaderComponent={listHeaderComponent ?? null}
      contentContainerStyle={styles.listContent}
      showsVerticalScrollIndicator={false}
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
});
