/**
 * UrgentSection – "Urgent" block: horizontal list of urgent listings.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from '@/lib/supabase';
import { getSignedUrlsMap, listingStoragePathsForCardCover, mapListingCardImages } from '@/lib/listingImageUrl';
import { normalizeListingSchemaFeatures } from '@/lib/listingSchemaFeatures';
import { ListingCard, LISTING_CARD_RAIL_STRIDE } from './ListingCard';
import type { PublicListing } from '@/services/listings';
import { listingPublicListSelect } from '@/services/listings/listingListSelect';
import { colors, spacing, ui } from '@/theme';
import { ListingSectionSkeleton } from './ListingSectionSkeleton';

const URGENT_LIMIT = 6;

export function UrgentSection() {
  const ITEM_WIDTH = LISTING_CARD_RAIL_STRIDE;
  const [listings, setListings] = useState<PublicListing[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('listings')
        .select(listingPublicListSelect(false))
        .eq('status', 'active')
        .eq('urgent', true)
        .order('created_at', { ascending: false })
        .limit(URGENT_LIMIT);

      if (!error && data) {
        const rows = data as any[];
        const allPaths = rows.flatMap((row: any) =>
          listingStoragePathsForCardCover(row.listing_images)
        );
        const signedMap = await getSignedUrlsMap(allPaths);
        
        const mapped = rows.map((row) => {
          const images = mapListingCardImages(row.listing_images, signedMap);
          const schema = normalizeListingSchemaFeatures(row);
          return {
            id: row.id,
            title: row.title,
            price: row.price,
            city: row.city,
            category_id: row.category_id ?? null,
            created_at: row.created_at,
            images,
            views_count: row.views_count ?? 0,
            seller_id: row.user_id ?? '',
            updated_at: row.updated_at,
            ...schema,
          } as PublicListing;
        });
        setListings(mapped);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const keyExtractor = useCallback((item: PublicListing) => item.id, []);
  
  const renderItem = useCallback(
    ({ item }: { item: PublicListing }) => <ListingCard listing={item} variant="rail" />,
    []
  );

  if (loading) {
    return <ListingSectionSkeleton title="Urgent" icon="alert-circle" iconColor={colors.error} />;
  }

  if (listings.length === 0) {
    return null;
  }

  return (
    <View style={styles.section}>
      <View style={styles.titleRow}>
        <Ionicons
          name="alert-circle"
          size={18}
          color={colors.error}
          style={styles.titleIcon}
        />
        <Text style={styles.title}>Urgent</Text>
      </View>
      <FlatList
        data={listings}
        keyExtractor={keyExtractor}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        style={styles.scroll}
        snapToInterval={ITEM_WIDTH}
        snapToAlignment="start"
        decelerationRate="fast"
        renderItem={renderItem}
        removeClippedSubviews
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
    ...ui.typography.h2,
    letterSpacing: -0.35,
    color: ui.colors.textPrimary,
    flex: 1,
  },
  scroll: {
    marginHorizontal: -spacing.base,
  },
  scrollContent: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.sm,
  },
});
