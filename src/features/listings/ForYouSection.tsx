/**
 * Pour vous – section recommandations (catégories consultées / favoris).
 * MVP : affiche les premières annonces du feed ; à brancher plus tard sur un endpoint dédié.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { getPublicListings } from '@/services/listings';
import { getFavoriteIds, toggleFavorite } from '@/services/favorites';
import { ListingCard } from './ListingCard';
import type { PublicListing } from '@/services/listings';
import { colors, spacing, typography, fontWeights } from '@/theme';

const FOR_YOU_LIMIT = 6;
const CARD_WIDTH = 168;
const CARD_GAP = spacing.sm;
const ITEM_WIDTH = CARD_WIDTH + CARD_GAP;
const INITIAL_NUM_TO_RENDER = 4;

export function ForYouSection() {
  const router = useRouter();
  const [listings, setListings] = useState<PublicListing[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await getPublicListings(0, FOR_YOU_LIMIT);
    setListings(result.data ?? []);
    const fav = await getFavoriteIds();
    if (fav.data) setFavoriteIds(new Set(fav.data));
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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
        <Ionicons name="sparkles-outline" size={18} color={colors.textMuted} style={styles.titleIcon} />
        <Text style={styles.title}>Pour vous</Text>
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
        renderItem={({ item }) => (
          <View style={styles.cardWrap}>
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
    paddingRight: spacing.base + CARD_GAP,
  },
  cardWrap: {
    width: ITEM_WIDTH,
    marginRight: 0,
  },
});
