/**
 * NearYouSection – "Près de vous" block: 4–6 listings from user's city or latest as fallback.
 * Horizontal FlatList, NearYouCard (variante locale), snap, perfs, "Voir plus" to search.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { getListingsByCity, getPublicListings } from '@/services/listings';
import { NearYouCard } from './NearYouCard';
import type { PublicListing } from '@/services/listings';
import { colors, spacing, typography, fontWeights } from '@/theme';
import { useCardWidth } from '@/hooks/useCardWidth';
import { ListingSectionSkeleton } from './ListingSectionSkeleton';

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

  if (loading) {
    return (
      <ListingSectionSkeleton
        title="Près de vous"
        icon="location-outline"
        iconColor={colors.primary}
        variant="nearYou"
        hasSubtitle
        titleVariant="featured"
      />
    );
  }

  if (listings.length === 0) {
    return null;
  }

  return (
    <View style={styles.section}>
      <View style={styles.titleBlock}>
        <View style={styles.titleRow}>
          <Ionicons
            name="location-outline"
            size={20}
            color={colors.primary}
            style={styles.titleIcon}
          />
          <Text style={styles.title}>Près de vous</Text>
        </View>
        <Text style={styles.subtitle}>Les meilleures offres autour de vous</Text>
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
        style={({ pressed }) => [styles.voirTout, pressed && styles.voirToutPressed]}
        onPress={handleVoirPlus}
        accessibilityRole="button"
        accessibilityLabel="Voir toutes les annonces à proximité"
      >
        <Text style={styles.voirToutLabel}>Voir tout</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.primary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: spacing.xl,
  },
  titleBlock: {
    marginBottom: spacing.md,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  titleIcon: {
    marginRight: spacing.sm,
  },
  title: {
    ...typography.lg,
    fontWeight: fontWeights.bold,
    color: colors.text,
    letterSpacing: -0.3,
    flex: 1,
  },
  subtitle: {
    ...typography.sm,
    color: colors.textMuted,
    marginTop: spacing.xs,
    marginLeft: 28,
  },
  scroll: {
    marginHorizontal: -spacing.base,
  },
  scrollContent: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.sm,
  },
  voirTout: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    marginTop: spacing.xs,
    marginLeft: -spacing.sm,
    borderRadius: 999,
  },
  voirToutPressed: {
    opacity: 0.85,
    backgroundColor: colors.primaryLight + '80',
  },
  voirToutLabel: {
    ...typography.sm,
    fontWeight: fontWeights.semibold,
    color: colors.primary,
  },
});
