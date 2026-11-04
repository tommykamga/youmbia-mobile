/**
 * Favorites tab – premium marketplace presentation (UI-FAVORITES-01).
 * Non connecté : Redirect vers /(auth)/gate?context=favorites (tab bar intercepte aussi).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  View,
  StyleSheet,
  RefreshControl,
  Platform,
  Text,
  PixelRatio,
  useWindowDimensions,
  InteractionManager,
} from 'react-native';
import { useRouter, Redirect, useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Screen, EmptyState, Button, LoadingState } from '@/components';
import { getFavorites } from '@/services/favorites';
import { getSession } from '@/services/auth';
import { ListingCard } from '@/features/listings';
import { buildHomeFeedGridRows, type HomeFeedGridRow } from '@/features/listings/homeFeedGridRows';
import { getListingsByIds, type PublicListing } from '@/services/listings';
import { spacing, colors, typography, fontWeights } from '@/theme';
import { useFavorites } from '@/context/FavoritesContext';
import { buildAuthGateHref } from '@/lib/authGateNavigation';
import {
  FavoritesScreenHeader,
  FAVORITES_MARKETPLACE_SURFACE,
} from '@/features/favorites/FavoritesScreenHeader';
import { deriveFavoritesDisplay } from '@/features/favorites/favoritesDisplay';
import {
  getHomeFeedColumnCount,
  getHomeFeedGridCellLayout,
  getHomeFeedGridInnerWidth,
  HOME_FEED_GRID_COLUMN_GAP,
} from '@/lib/responsiveLayout';

type FavoritesState =
  | { status: 'loading' }
  | { status: 'unauthenticated' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: PublicListing[] };

function DiscoverListingsButton({ onPress }: { onPress: () => void }) {
  return (
    <View style={styles.emptyAction}>
      <Button variant="secondary" onPress={onPress} style={styles.emptyCta}>
        <Text style={styles.emptyCtaText} numberOfLines={1} adjustsFontSizeToFit>
          Découvrir des annonces
        </Text>
      </Button>
    </View>
  );
}

export default function FavoritesScreen() {
  const { favorites, refresh } = useFavorites();
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();
  const fontScale = PixelRatio.getFontScale();
  const columnCount = getHomeFeedColumnCount(windowWidth, fontScale);
  const useGrid = columnCount === 2;
  const gridInnerWidth = useMemo(() => getHomeFeedGridInnerWidth(windowWidth), [windowWidth]);

  const [state, setState] = useState<FavoritesState>({ status: 'loading' });
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => {
    try {
      const session = await getSession();
      if (!session?.user) {
        setState({ status: 'unauthenticated' });
        return;
      }
      await refresh();
      const result = await getFavorites();
      if (result.error) {
        setState({ status: 'error', message: 'Impossible de charger' });
        return;
      }
      setState({ status: 'ready', data: result.data ?? [] });
    } catch {
      setState({ status: 'error', message: 'Impossible de charger' });
    }
  }, [refresh]);

  useFocusEffect(
    useCallback(() => {
      const task = InteractionManager.runAfterInteractions(() => {
        void load();
      });
      return () => task.cancel();
    }, [load])
  );

  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const current = stateRef.current;
    if (current.status !== 'ready') return;
    if (favorites.size === 0) return;

    const knownIds = new Set(current.data.map((item) => item.id));
    const missingIds = [...favorites].filter((id) => !knownIds.has(id));
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
        return { status: 'ready', data: [...newItems, ...prev.data] };
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [favorites]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load().finally(() => setRefreshing(false));
  }, [load]);

  const display = useMemo(() => {
    if (state.status !== 'ready') {
      return deriveFavoritesDisplay([], favorites);
    }
    return deriveFavoritesDisplay(state.data, favorites);
  }, [state, favorites]);

  const gridRows = useMemo(() => {
    if (!useGrid || display.mode !== 'list') return null;
    return buildHomeFeedGridRows(display.visibleListings, 2);
  }, [display.mode, display.visibleListings, useGrid]);

  const goDiscover = useCallback(() => {
    router.replace('/(tabs)/home');
  }, [router]);

  const renderListingCard = useCallback(
    (listing: PublicListing) => (
      <ListingCard
        listing={listing}
        feedPresentation="home"
        homeGridCell={useGrid}
        source="favorites"
      />
    ),
    [useGrid]
  );

  const renderGridRow = useCallback(
    ({ item }: { item: HomeFeedGridRow }) => {
      const cellCount = item.kind === 'cells' ? item.cells.length : 0;
      return (
        <View style={[styles.homeGridRow, { gap: HOME_FEED_GRID_COLUMN_GAP }]}>
          {item.kind === 'cells'
            ? item.cells.map((cell) => {
                const cellLayout = getHomeFeedGridCellLayout(gridInnerWidth, columnCount, cellCount);
                return (
                  <View
                    key={typeof cell === 'number' ? `sk-${cell}` : cell.id}
                    style={[styles.homeGridCell, cellLayout]}
                  >
                    {typeof cell === 'number' ? null : renderListingCard(cell)}
                  </View>
                );
              })
            : null}
        </View>
      );
    },
    [columnCount, gridInnerWidth, renderListingCard]
  );

  const renderSingleColumnItem = useCallback(
    ({ item }: { item: PublicListing }) => renderListingCard(item),
    [renderListingCard]
  );

  const listHeader = <FavoritesScreenHeader count={display.headerCount} />;

  const shellStyle = styles.screenSurface;

  if (state.status === 'loading') {
    return (
      <Screen noPadding safe={false} style={shellStyle}>
        <FavoritesScreenHeader count={0} />
        <LoadingState message="Chargement de vos favoris…" />
      </Screen>
    );
  }

  if (state.status === 'unauthenticated') {
    return <Redirect href={buildAuthGateHref('favorites')} />;
  }

  if (state.status === 'error') {
    return (
      <Screen noPadding safe={false} style={shellStyle}>
        <FavoritesScreenHeader count={0} />
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

  if (display.mode === 'empty_none') {
    return (
      <Screen noPadding safe={false} style={shellStyle}>
        <FavoritesScreenHeader count={0} />
        <View style={styles.emptyWrap}>
          <EmptyState
            variant="plain"
            icon={<Ionicons name="heart-outline" size={28} color={colors.primary} />}
            title="Aucun favori pour le moment"
            message="Les annonces que vous aimez apparaîtront ici."
            action={<DiscoverListingsButton onPress={goDiscover} />}
          />
        </View>
      </Screen>
    );
  }

  if (display.mode === 'empty_unavailable') {
    return (
      <Screen noPadding safe={false} style={shellStyle}>
        <FavoritesScreenHeader count={0} />
        <View style={styles.emptyWrap}>
          <EmptyState
            variant="plain"
            icon={<Ionicons name="heart" size={28} color={colors.primary} />}
            title="Annonces indisponibles"
            message={
              display.registeredCount === 1
                ? 'Vous avez 1 favori enregistré, mais cette annonce n’est plus disponible pour le moment. Votre favori est conservé.'
                : `Vous avez ${display.registeredCount} favoris enregistrés, mais ces annonces ne sont plus disponibles pour le moment. Vos favoris sont conservés.`
            }
            action={<DiscoverListingsButton onPress={goDiscover} />}
          />
        </View>
      </Screen>
    );
  }

  if (useGrid && gridRows) {
    return (
      <Screen noPadding safe={false} style={shellStyle}>
        <FlatList
          data={gridRows}
          keyExtractor={(item) => item.key}
          renderItem={renderGridRow}
          ListHeaderComponent={listHeader}
          ListFooterComponent={
            display.unavailableCount > 0 ? (
              <View style={styles.unavailableBanner} accessibilityRole="text">
                <Ionicons name="information-circle-outline" size={18} color={colors.textSecondary} />
                <Text style={styles.unavailableBannerText}>
                  {display.unavailableCount === 1
                    ? '1 autre favori enregistré n’est pas affiché car l’annonce n’est plus disponible.'
                    : `${display.unavailableCount} autres favoris enregistrés ne sont pas affichés car les annonces ne sont plus disponibles.`}
                </Text>
              </View>
            ) : null
          }
          ItemSeparatorComponent={() => <View style={styles.gridRowSeparator} />}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          initialNumToRender={4}
          maxToRenderPerBatch={6}
          windowSize={Platform.OS === 'ios' ? 6 : 10}
          removeClippedSubviews={Platform.OS === 'ios'}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={FAVORITES_MARKETPLACE_SURFACE}
            />
          }
        />
      </Screen>
    );
  }

  return (
    <Screen noPadding safe={false} style={shellStyle}>
      <FlatList
        data={display.visibleListings}
        keyExtractor={(item) => item.id}
        renderItem={renderSingleColumnItem}
        ListHeaderComponent={listHeader}
        ListFooterComponent={
          display.unavailableCount > 0 ? (
            <View style={styles.unavailableBanner} accessibilityRole="text">
              <Ionicons name="information-circle-outline" size={18} color={colors.textSecondary} />
              <Text style={styles.unavailableBannerText}>
                {display.unavailableCount === 1
                  ? '1 autre favori enregistré n’est pas affiché car l’annonce n’est plus disponible.'
                  : `${display.unavailableCount} autres favoris enregistrés ne sont pas affichés car les annonces ne sont plus disponibles.`}
              </Text>
            </View>
          ) : null
        }
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        initialNumToRender={8}
        maxToRenderPerBatch={6}
        windowSize={Platform.OS === 'ios' ? 6 : 10}
        removeClippedSubviews={Platform.OS === 'ios'}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={FAVORITES_MARKETPLACE_SURFACE}
          />
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screenSurface: {
    backgroundColor: colors.surface,
  },
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
  gridRowSeparator: {
    height: HOME_FEED_GRID_COLUMN_GAP,
  },
  homeGridRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  homeGridCell: {
    minWidth: 0,
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
  unavailableBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: 16,
    backgroundColor: colors.background,
  },
  unavailableBannerText: {
    ...typography.sm,
    color: colors.textSecondary,
    flex: 1,
  },
});
