/**
 * Favorites tab – Sprint 3.1.
 * Non connecté : Redirect vers /(auth)/gate?context=favorites (tab bar intercepte aussi).
 */

import React, { useCallback, useEffect, useState, useMemo, useRef } from 'react';
import { FlatList, View, StyleSheet, RefreshControl, Platform, Text } from 'react-native';
import { useRouter, Redirect, useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Screen, EmptyState, Button, AppHeader, LoadingState } from '@/components';
import { getFavorites } from '@/services/favorites';
import { getSession } from '@/services/auth';
import { ListingCard } from '@/features/listings';
import { getListingsByIds, type PublicListing } from '@/services/listings';
import { spacing, colors, typography, fontWeights } from '@/theme';
import { useFavorites } from '@/context/FavoritesContext';
import { buildAuthGateHref } from '@/lib/authGateNavigation';

type FavoritesState =
  | { status: 'loading' }
  | { status: 'unauthenticated' }
  | { status: 'error'; message: string }
  // `ready` = pool d'annonces chargées (peut être vide). L'affichage réel est
  // dérivé du Set global de favoris → voir `displayData`.
  | { status: 'ready'; data: PublicListing[] };

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
      // `getFavorites` renvoie déjà les annonces triées par favori le plus récent.
      setState({ status: 'ready', data: result.data ?? [] });
    } catch {
      setState({ status: 'error', message: 'Impossible de charger' });
    }
  }, [favoritesLoading]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const stateRef = useRef(state);
  stateRef.current = state;

  // Synchronisation incrémentale : le Set global est la source de vérité.
  // - Ajout d'un favori absent du pool → fetch ciblé de l'annonce manquante.
  // - Retrait → géré sans fetch par le filtre `displayData` (pas de reset/flicker).
  useEffect(() => {
    if (favoritesLoading) return;
    const current = stateRef.current;
    if (current.status !== 'ready') return;
    if (favorites.size === 0) return;

    const knownIds = new Set(current.data.map((item) => item.id));
    const missingIds = [...favorites].filter((id) => !knownIds.has(id));

    if (__DEV__) {
      console.log(
        '[Favorites] sync — favorites:', favorites.size,
        '| missingIds:', missingIds.length ? missingIds : '∅'
      );
    }

    if (missingIds.length === 0) return;

    let cancelled = false;
    void (async () => {
      const result = await getListingsByIds(missingIds);
      if (cancelled || result.error || !result.data?.length) return;
      setState((prev) => {
        if (prev.status !== 'ready') return prev;
        const known = new Set(prev.data.map((item) => item.id));
        const newItems = result.data!.filter((item) => !known.has(item.id));
        if (!newItems.length) return prev;
        // Annonces fraîchement ajoutées en tête (favori le plus récent).
        return { status: 'ready', data: [...newItems, ...prev.data] };
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [favorites, favoritesLoading]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load().finally(() => setRefreshing(false));
  }, [load]);

  // Affichage dérivé du Set global : filtré + dédupliqué, ordre du pool conservé
  // (récents en tête). Retraits reflétés immédiatement, sans toucher au pool.
  const displayData = useMemo(() => {
    if (state.status !== 'ready') return [];
    const seen = new Set<string>();
    const out: PublicListing[] = [];
    for (const item of state.data) {
      if (favorites.has(item.id) && !seen.has(item.id)) {
        seen.add(item.id);
        out.push(item);
      }
    }
    return out;
  }, [state, favorites]);

  useEffect(() => {
    if (__DEV__ && state.status === 'ready') {
      console.log('[Favorites] affichées:', displayData.length, '/', favorites.size);
    }
  }, [displayData.length, favorites.size, state.status]);

  const keyExtractor = useCallback((item: PublicListing) => item.id, []);
  const renderItem = useCallback(
    ({ item }: { item: PublicListing }) => (
      <ListingCard listing={item} source="favorites" />
    ),
    []
  );
  const itemSeparator = useCallback(() => <View style={styles.separator} />, []);

  if (state.status === 'loading') {
    return (
      <Screen noPadding safe={false}>
        <AppHeader title="Favoris" noBorder density="compact" />
        <LoadingState message="Chargement de vos favoris…" />
      </Screen>
    );
  }

  if (state.status === 'unauthenticated') {
    return <Redirect href={buildAuthGateHref('favorites')} />;
  }

  if (state.status === 'error') {
    return (
      <Screen noPadding safe={false}>
        <AppHeader title="Favoris" noBorder density="compact" />
        <View style={styles.emptyWrap}>
          <EmptyState
            variant="plain"
            icon={<Ionicons name="cloud-offline-outline" size={24} color={colors.error} />}
            title="Impossible de charger vos favoris"
            message="Vérifiez votre connexion, puis réessayez. Vos favoris ne sont pas perdus."
            action={
              <View style={styles.emptyAction}>
                <Button variant="secondary" onPress={() => void load()} style={styles.emptyCta}>
                  Réessayer
                </Button>
              </View>
            }
          />
        </View>
      </Screen>
    );
  }

  if (state.status === 'ready' && displayData.length === 0) {
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
    paddingHorizontal: spacing.screenHorizontal,
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
