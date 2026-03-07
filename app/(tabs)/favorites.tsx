/**
 * Favorites tab – Sprint 3.1.
 * Auth-gated: unauthenticated → redirect to login with return context.
 * Loading, error, empty, success with pull-to-refresh; optimistic unfavorite with rollback.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, View, StyleSheet, RefreshControl } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Screen, Loader, EmptyState } from '@/components';
import { getFavorites, toggleFavorite } from '@/services/favorites';
import { getSession } from '@/services/auth';
import { ListingCard } from '@/features/listings';
import type { PublicListing } from '@/services/listings';
import { spacing, colors } from '@/theme';

type FavoritesState =
  | { status: 'loading' }
  | { status: 'redirect' }
  | { status: 'empty' }
  | { status: 'error'; message: string }
  | { status: 'success'; data: PublicListing[] };

export default function FavoritesScreen() {
  const router = useRouter();
  const [state, setState] = useState<FavoritesState>({ status: 'loading' });
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const session = await getSession();
    if (!session?.user) {
      setState({ status: 'redirect' });
      return;
    }
    const result = await getFavorites();
    if (result.error) {
      setState({ status: 'error', message: result.error.message });
      return;
    }
    const list = result.data ?? [];
    setState(
      list.length === 0
        ? { status: 'empty' }
        : { status: 'success', data: list }
    );
  }, []);

  useEffect(() => {
    load().then(() => setRefreshing(false));
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load().finally(() => setRefreshing(false));
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      if (state.status === 'success' || state.status === 'empty') {
        load();
      }
    }, [load, state.status])
  );

  useEffect(() => {
    if (state.status === 'redirect') {
      router.replace(`/(auth)/login?redirect=${encodeURIComponent('/(tabs)/favorites')}`);
    }
  }, [state.status, router]);

  const handleFavoritePress = useCallback(
    async (listingId: string) => {
      if (state.status !== 'success') return;
      const previousData = state.data;
      setState({
        status: 'success',
        data: state.data.filter((item) => item.id !== listingId),
      });
      const result = await toggleFavorite(listingId);
      if (result.error) {
        setState({ status: 'success', data: previousData });
        if (result.error.message === 'Non connecté') {
          router.replace(`/(auth)/login?redirect=${encodeURIComponent('/(tabs)/favorites')}`);
        }
        return;
      }
    },
    [state, router]
  );

  const keyExtractor = useCallback((item: PublicListing) => item.id, []);
  const renderItem = useCallback(
    ({ item }: { item: PublicListing }) => (
      <ListingCard
        listing={item}
        isFavorite
        onFavoritePress={() => handleFavoritePress(item.id)}
      />
    ),
    [handleFavoritePress]
  );
  const itemSeparator = useCallback(() => <View style={styles.separator} />, []);

  if (state.status === 'loading' || state.status === 'redirect') {
    return <Loader />;
  }

  if (state.status === 'error') {
    return (
      <Screen>
        <EmptyState title="Erreur" message={state.message} style={styles.center} />
      </Screen>
    );
  }

  if (state.status === 'empty') {
    return (
      <Screen>
        <EmptyState
          title="Aucun favori"
          message="Vos annonces favorites apparaîtront ici."
          style={styles.center}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <FlatList
        data={state.data}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ItemSeparatorComponent={itemSeparator}
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1 },
  listContent: {
    padding: spacing.base,
    paddingBottom: spacing['3xl'],
    flexGrow: 1,
  },
  separator: {
    height: spacing.base,
  },
});
