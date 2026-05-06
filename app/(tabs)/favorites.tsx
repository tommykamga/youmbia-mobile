/**
 * Favorites tab – Sprint 3.1.
 * Non connecté : Redirect vers /(auth)/gate?context=favorites (tab bar intercepte aussi).
 */

import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { FlatList, View, StyleSheet, RefreshControl, Platform, Text } from 'react-native';
import { useRouter, Redirect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Screen, Loader, EmptyState, Button, AppHeader } from '@/components';
import { getFavorites } from '@/services/favorites';
import { getSession } from '@/services/auth';
import { ListingCard } from '@/features/listings';
import type { PublicListing } from '@/services/listings';
import { spacing, colors, typography, fontWeights } from '@/theme';
import { useFavorites } from '@/context/FavoritesContext';
import { buildAuthGateHref } from '@/lib/authGateNavigation';

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
    return <Redirect href={buildAuthGateHref('favorites')} />;
  }

  if (state.status === 'error') {
    return (
      <Screen noPadding safe={false}>
        <AppHeader title="Favoris" noBorder density="compact" />
        <View style={styles.emptyWrap}>
          <EmptyState variant="plain" title="Erreur" message={state.message} />
        </View>
      </Screen>
    );
  }

  if (state.status === 'empty') {
    return (
      <Screen noPadding safe={false}>
        <AppHeader title="Favoris" noBorder density="compact" />
        <View style={styles.emptyWrap}>
          <EmptyState
            variant="plain"
            icon={<Ionicons name="heart-outline" size={24} color={colors.primary} />}
            title="Aucun favori pour le moment"
            message="Les annonces que vous aimez apparaîtront ici."
            action={
              <View style={styles.emptyAction}>
                <Button variant="secondary" onPress={() => router.replace('/(tabs)/home')} style={styles.emptyCta}>
                  <Text style={styles.emptyCtaText} numberOfLines={1} adjustsFontSizeToFit>
                    Découvrir les annonces
                  </Text>
                </Button>
              </View>
            }
          />
        </View>
      </Screen>
    );
  }

  const listHeader = <AppHeader title="Favoris" noBorder density="compact" />;

  return (
    <Screen noPadding safe={false}>
      <FlatList
        data={displayData}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ItemSeparatorComponent={itemSeparator}
        ListHeaderComponent={listHeader}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        initialNumToRender={10}
        maxToRenderPerBatch={6}
        windowSize={Platform.OS === 'ios' ? 6 : 10}
        removeClippedSubviews={Platform.OS === 'ios'}
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
  emptyWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingBottom: 72,
    transform: [{ translateY: -32 }],
  },
  listContent: {
    maxWidth: 760,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: spacing.base,
    paddingTop: spacing.xs,
    paddingBottom: spacing['3xl'],
    flexGrow: 1,
  },
  separator: {
    height: spacing.base,
  },
  emptyAction: {
    width: '100%',
    alignItems: 'center',
  },
  emptyCta: {
    alignSelf: 'center',
    maxWidth: 340,
    width: 'auto',
    minHeight: 52,
    paddingHorizontal: 26,
    borderRadius: 18,
  },
  emptyCtaText: {
    ...typography.base,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: fontWeights.bold,
  },
});
