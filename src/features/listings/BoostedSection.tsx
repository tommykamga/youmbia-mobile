/**
 * BoostedSection – "À la une" block: horizontal list of boosted listings.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from '@/lib/supabase';
import { getSignedUrlsMap, toDisplayImageUrl } from '@/lib/listingImageUrl';
import { normalizeListingSchemaFeatures } from '@/lib/listingSchemaFeatures';
import { ListingCard } from './ListingCard';
import type { PublicListing } from '@/services/listings';
import { colors, spacing, typography, fontWeights } from '@/theme';
import { useCardWidth } from '@/hooks/useCardWidth';
import { ListingSectionSkeleton } from './ListingSectionSkeleton';

const BOOSTED_LIMIT = 6;

export function BoostedSection() {
  const cardWidth = useCardWidth();
  const ITEM_WIDTH = cardWidth + spacing.sm;
  const [listings, setListings] = useState<PublicListing[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('listings')
        .select(
          'id, title, price, city, boosted, urgent, district, created_at, updated_at, views_count, user_id, listing_images(url, sort_order)'
        )
        .eq('status', 'active')
        .eq('boosted', true)
        .order('created_at', { ascending: false })
        .limit(BOOSTED_LIMIT);

      if (!error && data) {
        const rows = data as any[];
        const allPaths = rows.flatMap((row) =>
          (row.listing_images ?? []).map((img: any) => String(img.url ?? '').trim()).filter(Boolean)
        );
        const signedMap = await getSignedUrlsMap(allPaths);
        
        const mapped = rows.map((row) => {
          const images = (row.listing_images ?? [])
            .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
            .map((img: any) => toDisplayImageUrl(img.url ?? '', signedMap))
            .filter((url: string) => url !== '');
          const schema = normalizeListingSchemaFeatures(row);
          return {
            id: row.id,
            title: row.title,
            price: row.price,
            city: row.city,
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
    ({ item }: { item: PublicListing }) => (
      <View style={{ width: cardWidth }}>
        <ListingCard
          listing={item}
        />
      </View>
    ),
    [cardWidth]
  );

  if (loading) {
    return <ListingSectionSkeleton title="À la une" icon="flash" iconColor="#FFB800" />;
  }

  if (listings.length === 0) {
    return null;
  }

  return (
    <View style={styles.section}>
      <View style={styles.titleRow}>
        <Ionicons
          name="flash"
          size={18}
          color="#FFB800"
          style={styles.titleIcon}
        />
        <Text style={styles.title}>À la une</Text>
      </View>
      <FlatList
        data={listings}
        keyExtractor={keyExtractor}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        style={styles.scroll}
        ItemSeparatorComponent={() => <View style={{ width: spacing.sm }} />}
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
});
