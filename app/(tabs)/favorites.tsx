/**
 * Favorites tab – Sprint 3.1.
 * Auth-gated: unauthenticated → redirect to login with return context.
 * Loading, error, empty, success with pull-to-refresh; optimistic unfavorite with rollback.
 */

import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { FlatList, View, StyleSheet, RefreshControl } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Screen, Loader, EmptyState, Button, AuthGate } from '@/components';
import { getFavorites } from '@/services/favorites';
import { getSession } from '@/services/auth';
import { ListingCard } from '@/features/listings';
import type { PublicListing } from '@/services/listings';
import { spacing, colors } from '@/theme';
import { useFavorites } from '@/context/FavoritesContext';

type FavoritesState =
  | { status: 'loading' }
  | { status: 'unauthenticated' }
  | { status: 'empty' }
  | { status: 'error'; message: string }
  | { status: 'success'; data: PublicListing[] };

export default function FavoritesScreen() {
  const { favorites, loading: favoritesLoading } = useFavorites();
  const router = useRouter();
  const [state, setState] = useState<FavoritesState>({ status: 'loading' });
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      if (favoritesLoading) return;
      const session = await getSession();
      if (!session?.user) {
        setState({ status: 'unauthenticated' });
        return;
      }
      const result = await getFavorites();
      if (result.error) {
        setState({ status: 'error', message: 'Impossible de charger' });
        return;
      }
      const list = result.data ?? [];
      setState(
        list.length === 0
          ? { status: 'empty' }
          : { status: 'success', data: list }
      );
    } catch {
      setState({ status: 'error', message: 'Impossible de charger' });
    }
  }, [favoritesLoading]);

  useEffect(() => {
    load().then(() => setRefreshing(false));
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load().finally(() => setRefreshing(false));
  }, [load]);

  // Sync state data with global favorites Set (for immediate removal from list)
  const displayData = useMemo(() => {
    if (state.status !== 'success') return [];
    return state.data.filter(item => favorites.has(item.id));
  }, [state, favorites]);

  const keyExtractor = useCallback((item: PublicListing) => item.id, []);
  const renderItem = useCallback(
    ({ item }: { item: PublicListing }) => (
      <ListingCard listing={item} />
    ),
    []
  );
  const itemSeparator = useCallback(() => <View style={styles.separator} />, []);

  if (state.status === 'loading') {
    return <Loader />;
  }

  if (state.status === 'unauthenticated') {
    return <AuthGate context="favorites" />;
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
          icon={<Ionicons name="heart-outline" size={24} color={colors.primary} />}
          title="Aucune annonce favorite"
          message="Les annonces que vous aimez apparaîtront ici."
          action={
            <View style={styles.emptyAction}>
              <Button variant="secondary" onPress={() => router.replace('/(tabs)/home')}>
                Découvrir les annonces
              </Button>
            </View>
          }
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
        initialNumToRender={10}
        maxToRenderPerBatch={6}
        windowSize={6}
        removeClippedSubviews
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
  emptyAction: {
    minWidth: 220,
  },
});
