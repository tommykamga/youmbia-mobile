/**
 * Consultés récemment – affiche les dernières annonces vues (mode hors ligne / continuité).
 */

import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { getListingsByIds } from '@/services/listings';
import { getRecentlyViewedListingIds } from '@/services/recentlyViewed';
import { ListingCard, LISTING_CARD_RAIL_STRIDE } from './ListingCard';
import type { PublicListing } from '@/services/listings';
import { colors, spacing, typography, fontWeights } from '@/theme';
import { ListingSectionSkeleton } from './ListingSectionSkeleton';

const INITIAL_NUM_TO_RENDER = 4;

export function RecentlyViewedSection() {
  const ITEM_WIDTH = LISTING_CARD_RAIL_STRIDE;
  const [listings, setListings] = useState<PublicListing[]>([]);
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
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (loading) {
    // Only show skeleton if we actually have IDs to fetch
    const ids = getRecentlyViewedListingIds();
    if (ids.length > 0) {
      return <ListingSectionSkeleton title="Consultés récemment" icon="time-outline" />;
    }
    return null;
  }

  if (listings.length === 0) {
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
        renderItem={({ item }) => <ListingCard listing={item} variant="rail" />}
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
