/**
 * Consultés récemment – affiche les dernières annonces vues (mode hors ligne / continuité).
 */

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { getListingsByIds } from '@/services/listings';
import { getFavoriteIds, toggleFavorite } from '@/services/favorites';
import { getRecentlyViewedListingIds } from '@/services/recentlyViewed';
import { ListingCard } from './ListingCard';
import type { PublicListing } from '@/services/listings';
import { colors, spacing, typography, fontWeights } from '@/theme';
import { useCardWidth } from '@/hooks/useCardWidth';

const INITIAL_NUM_TO_RENDER = 4;

export function RecentlyViewedSection() {
  const router = useRouter();
  const cardWidth = useCardWidth();
  const ITEM_WIDTH = cardWidth + spacing.sm;
  const [listings, setListings] = useState<PublicListing[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const ids = getRecentlyViewedListingIds();
    if (ids.length === 0) {
      setListings([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const result = await getListingsByIds(ids);
    setListings(result.data ?? []);
    const fav = await getFavoriteIds();
    if (fav.data) setFavoriteIds(new Set(fav.data));
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleFavoritePress = useCallback(
    async (listingId: string) => {
      const next = !favoriteIds.has(listingId);
      setFavoriteIds((prev) => {
        const nextSet = new Set(prev);
        if (next) nextSet.add(listingId);
        else nextSet.delete(listingId);
        return nextSet;
      });
      const result = await toggleFavorite(listingId);
      if (result.error) {
        setFavoriteIds((prev) => {
          const reverted = new Set(prev);
          if (next) reverted.delete(listingId);
          else reverted.add(listingId);
          return reverted;
        });
        if (result.error.message === 'Non connecté') {
          router.replace(`/(auth)/login?redirect=${encodeURIComponent('/(tabs)/home')}`);
        }
      }
    },
    [favoriteIds, router]
  );

  if (loading || listings.length === 0) {
    return null;
  }

  return (
    <View style={styles.section}>
      <View style={styles.titleRow}>
        <Ionicons name="time-outline" size={18} color={colors.textMuted} style={styles.titleIcon} />
        <Text style={styles.title}>Consultés récemment</Text>
      </View>
      <FlatList
        data={listings}
        keyExtractor={(item) => item.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        style={styles.scroll}
        getItemLayout={(_, index) => ({
          length: ITEM_WIDTH,
          offset: index * ITEM_WIDTH,
          index,
        })}
        initialNumToRender={INITIAL_NUM_TO_RENDER}
        windowSize={5}
        removeClippedSubviews
        snapToInterval={ITEM_WIDTH}
        snapToAlignment="start"
        decelerationRate="fast"
        ItemSeparatorComponent={() => <View style={{ width: spacing.sm }} />}
        renderItem={({ item }) => (
          <View style={{ width: cardWidth }}>
            <ListingCard
              listing={item}
              isFavorite={favoriteIds.has(item.id)}
              onFavoritePress={() => handleFavoritePress(item.id)}
            />
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: spacing.xl,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  titleIcon: {
    marginRight: spacing.xs,
  },
  title: {
    ...typography.sm,
    fontWeight: fontWeights.semibold,
    color: colors.text,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  scroll: {
    marginHorizontal: -spacing.base,
  },
  scrollContent: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.sm,
  },
});
