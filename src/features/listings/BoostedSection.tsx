/**
 * BoostedSection – « À la une » : titre + Voir tout, rail horizontal (max 6).
 * Chargement : placeholders sans titre (pas de section « vide » trompeuse).
 * Données inchangées (même requête Supabase que l’historique).
 */

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable } from 'react-native';
import { supabase } from '@/lib/supabase';
import { getSignedUrlsMap, toDisplayImageUrl } from '@/lib/listingImageUrl';
import { normalizeListingSchemaFeatures } from '@/lib/listingSchemaFeatures';
import { ListingCard, LISTING_CARD_RAIL_STRIDE_FEATURED } from './ListingCard';
import type { PublicListing } from '@/services/listings';
import { spacing, ui, colors } from '@/theme';

const BOOSTED_LIMIT = 6;

export type BoostedSectionProps = {
  onVoirToutPress?: () => void;
};

export function BoostedSection({ onVoirToutPress }: BoostedSectionProps) {
  const ITEM_WIDTH = LISTING_CARD_RAIL_STRIDE_FEATURED;
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
      <ListingCard listing={item} variant="rail" railPresentation="featured" />
    ),
    []
  );

  if (loading) {
    return (
      <View style={styles.loadingBlock} accessibilityLabel="Chargement des annonces à la une">
        {[0, 1, 2].map((k) => (
          <View key={k} style={styles.loadingCard} />
        ))}
      </View>
    );
  }

  if (listings.length === 0) {
    return null;
  }

  return (
    <View style={styles.section}>
      <View style={styles.headRow}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          🔥 À la une
        </Text>
        {onVoirToutPress ? (
          <Pressable onPress={onVoirToutPress} hitSlop={10} accessibilityRole="link" accessibilityLabel="Voir tout">
            <Text style={styles.voirTout}>Voir tout</Text>
          </Pressable>
        ) : null}
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
  loadingBlock: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: spacing.md,
    marginBottom: spacing.lg,
  },
  loadingCard: {
    width: 132,
    height: 172,
    borderRadius: 14,
    backgroundColor: colors.surfaceMuted,
  },
  section: {
    marginBottom: spacing.xl,
    paddingHorizontal: 0,
  },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    ...ui.typography.h2,
    letterSpacing: -0.35,
    color: ui.colors.textPrimary,
    flex: 1,
  },
  voirTout: {
    ...ui.typography.bodySmall,
    fontWeight: '600',
    color: ui.colors.primary,
  },
  scroll: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingLeft: 16,
    paddingRight: 8,
    paddingBottom: spacing.xs,
  },
});
