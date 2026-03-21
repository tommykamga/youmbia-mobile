/**
 * NearYouSection – "Près de vous" block: 4–6 listings from user's city or latest as fallback.
 * Horizontal FlatList, NearYouCard (variante locale), snap, perfs, "Voir plus" to search.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { getListingsByCity, getPublicListings } from '@/services/listings';
import { getFavoriteIds, toggleFavorite } from '@/services/favorites';
import { NearYouCard } from './NearYouCard';
import type { PublicListing } from '@/services/listings';
import { colors, spacing, typography, fontWeights } from '@/theme';
import { useCardWidth } from '@/hooks/useCardWidth';
import { useFavorites } from '@/context/FavoritesContext';

const NEAR_YOU_LIMIT = 6;
const INITIAL_NUM_TO_RENDER = 4;
const WINDOW_SIZE = 5;

export type NearYouSectionProps = {
  /** User city for local listings; when null/empty, show latest listings. */
  userCity?: string | null;
};

export function NearYouSection({ userCity }: NearYouSectionProps) {
  const router = useRouter();
  const cardWidth = useCardWidth();
  const ITEM_WIDTH = cardWidth + spacing.sm;
  const { isFavorite } = useFavorites();
  const [listings, setListings] = useState<PublicListing[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const city = userCity?.trim();
    if (city) {
      const result = await getListingsByCity(city, NEAR_YOU_LIMIT);
      if (result.error) {
        const fallback = await getPublicListings();
        setListings((fallback.data ?? []).slice(0, NEAR_YOU_LIMIT));
      } else {
        setListings(result.data ?? []);
      }
    } else {
      const result = await getPublicListings();
      setListings((result.data ?? []).slice(0, NEAR_YOU_LIMIT));
    }
    setLoading(false);
  }, [userCity]);

  useEffect(() => {
    load();
  }, [load]);

  const keyExtractor = useCallback((item: PublicListing) => item.id, []);
  const renderItem = useCallback(
    ({ item }: { item: PublicListing }) => (
      <View style={{ width: cardWidth }}>
        <NearYouCard
          listing={item}
          userCity={userCity}
        />
      </View>
    ),
    [cardWidth, userCity]
  );

  const handleVoirPlus = useCallback(() => {
    const city = userCity?.trim();
    if (city) {
      router.push(`/(tabs)/search?q=${encodeURIComponent(city)}`);
    } else {
      router.push('/(tabs)/search');
    }
  }, [userCity, router]);

  if (loading || listings.length === 0) {
    return null;
  }

  return (
    <View style={styles.section}>
      <View style={styles.titleRow}>
        <Ionicons
          name="location-outline"
          size={18}
          color={colors.textMuted}
          style={styles.titleIcon}
        />
        <Text style={styles.title}>Près de vous</Text>
      </View>
      <FlatList
        data={listings}
        keyExtractor={keyExtractor}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        style={styles.scroll}
        ItemSeparatorComponent={() => <View style={{ width: spacing.sm }} />}
        getItemLayout={(_, index) => ({
          length: ITEM_WIDTH,
          offset: index * ITEM_WIDTH,
          index,
        })}
        initialNumToRender={INITIAL_NUM_TO_RENDER}
        windowSize={WINDOW_SIZE}
        removeClippedSubviews
        snapToInterval={ITEM_WIDTH}
        snapToAlignment="start"
        decelerationRate="fast"
        renderItem={renderItem}
      />
      <Pressable
        style={({ pressed }) => [styles.voirPlus, pressed && styles.voirPlusPressed]}
        onPress={handleVoirPlus}
      >
        <Text style={styles.voirPlusLabel}>Voir plus</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.primary} />
      </Pressable>
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
    fontWeight: fontWeights.bold,
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
  voirPlus: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingVertical: spacing.sm,
    paddingRight: spacing.xs,
    marginTop: spacing.xs,
  },
  voirPlusPressed: {
    opacity: 0.8,
  },
  voirPlusLabel: {
    ...typography.sm,
    fontWeight: fontWeights.semibold,
    color: colors.primary,
  },
});
