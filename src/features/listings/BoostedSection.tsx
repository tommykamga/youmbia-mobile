/**
 * BoostedSection – « À la une » : rail horizontal, egress limité.
 * - 1ʳᵉ requête : 3 annonces max ; option « Afficher plus » : +3 (6 max au total).
 * - Cache mémoire module (TTL aligné sur le feed Home) : pas de refetch au retour sur Home.
 * - Aucune requête si le cache dit « 0 annonce » pendant le TTL.
 * - Cartes : une seule image (mapListingCardImages).
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable } from 'react-native';
import { supabase } from '@/lib/supabase';
import { getSignedUrlsMap, listingStoragePathsForCardCover, mapListingCardImages } from '@/lib/listingImageUrl';
import { normalizeListingSchemaFeatures } from '@/lib/listingSchemaFeatures';
import { ListingCard, LISTING_CARD_RAIL_STRIDE_FEATURED } from './ListingCard';
import type { PublicListing } from '@/services/listings';
import { listingPublicListSelect } from '@/services/listings/listingListSelect';
import { LIGHT_CACHE_TTL_MS } from '@/lib/lightCache';
import { spacing, ui, colors } from '@/theme';

const BOOSTED_FIRST_RANGE = { from: 0, to: 2 } as const;
const BOOSTED_SECOND_RANGE = { from: 3, to: 5 } as const;
const BOOSTED_TTL_MS = LIGHT_CACHE_TTL_MS.homeFeedPublic;

type BoostedMem = {
  listings: PublicListing[];
  fullyLoaded: boolean;
  savedAt: number;
};

let boostedMemStore: BoostedMem | null = null;

function readBoostedMem(): BoostedMem | null {
  if (!boostedMemStore) return null;
  if (Date.now() - boostedMemStore.savedAt > BOOSTED_TTL_MS) {
    boostedMemStore = null;
    return null;
  }
  return boostedMemStore;
}

function writeBoostedMem(listings: PublicListing[], fullyLoaded: boolean) {
  boostedMemStore = { listings, fullyLoaded, savedAt: Date.now() };
}

function mapRowsToListings(rows: any[], signedMap: Map<string, string>): PublicListing[] {
  return rows.map((row) => {
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
}

async function fetchBoostedRange(from: number, to: number): Promise<any[]> {
  const { data, error } = await supabase
    .from('listings')
    .select(listingPublicListSelect(false))
    .eq('status', 'active')
    .eq('boosted', true)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error || !data) return [];
  return data as any[];
}

export type BoostedSectionProps = {
  onVoirToutPress?: () => void;
};

export function BoostedSection({ onVoirToutPress }: BoostedSectionProps) {
  const ITEM_WIDTH = LISTING_CARD_RAIL_STRIDE_FEATURED;
  const [listings, setListings] = useState<PublicListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [fullyLoaded, setFullyLoaded] = useState(false);
  const [railExpanded, setRailExpanded] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const applyRows = useCallback(async (rows: any[]) => {
    const allPaths = rows.flatMap((row: any) => listingStoragePathsForCardCover(row.listing_images));
    const signedMap = await getSignedUrlsMap(allPaths);
    return mapRowsToListings(rows, signedMap);
  }, []);

  const load = useCallback(async () => {
    const mem = readBoostedMem();
    if (mem) {
      setListings(mem.listings);
      setFullyLoaded(mem.fullyLoaded);
      setRailExpanded(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const rows = await fetchBoostedRange(BOOSTED_FIRST_RANGE.from, BOOSTED_FIRST_RANGE.to);
      const mapped = await applyRows(rows);
      setListings(mapped);
      const done = mapped.length < 3;
      setFullyLoaded(done);
      setRailExpanded(false);
      writeBoostedMem(mapped, done);
    } finally {
      setLoading(false);
    }
  }, [applyRows]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadSecondBatch = useCallback(async () => {
    if (loadingMore || fullyLoaded || listings.length !== 3) return;
    setLoadingMore(true);
    try {
      const rows = await fetchBoostedRange(BOOSTED_SECOND_RANGE.from, BOOSTED_SECOND_RANGE.to);
      const mapped = await applyRows(rows);
      const seen = new Set(listings.map((l) => l.id));
      const extra = mapped.filter((l) => !seen.has(l.id));
      const merged = [...listings, ...extra].slice(0, 6);
      setListings(merged);
      setFullyLoaded(true);
      writeBoostedMem(merged, true);
    } finally {
      setLoadingMore(false);
    }
  }, [applyRows, fullyLoaded, listings, loadingMore]);

  const displayedListings = useMemo(() => {
    if (listings.length <= 3) return listings;
    if (railExpanded) return listings;
    return listings.slice(0, 3);
  }, [listings, railExpanded]);

  const showLoadMoreNetwork = listings.length === 3 && !fullyLoaded;
  const showExpandLocal = fullyLoaded && listings.length > 3 && !railExpanded;

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
      {showLoadMoreNetwork ? (
        <Pressable
          onPress={() => void loadSecondBatch()}
          disabled={loadingMore}
          style={({ pressed }) => [styles.inlineMoreBtn, pressed && styles.inlineMoreBtnPressed]}
          accessibilityRole="button"
          accessibilityLabel="Afficher plus d’annonces à la une"
        >
          <Text style={styles.inlineMoreText}>{loadingMore ? 'Chargement…' : 'Afficher plus'}</Text>
        </Pressable>
      ) : null}
      {showExpandLocal ? (
        <Pressable
          onPress={() => setRailExpanded(true)}
          style={({ pressed }) => [styles.inlineMoreBtn, pressed && styles.inlineMoreBtnPressed]}
          accessibilityRole="button"
          accessibilityLabel="Afficher toutes les annonces à la une"
        >
          <Text style={styles.inlineMoreText}>Afficher la suite</Text>
        </Pressable>
      ) : null}
      <FlatList
        data={displayedListings}
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
        initialNumToRender={3}
        maxToRenderPerBatch={3}
        windowSize={3}
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
  inlineMoreBtn: {
    alignSelf: 'flex-start',
    marginLeft: 16,
    marginBottom: spacing.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  inlineMoreBtnPressed: {
    opacity: 0.85,
  },
  inlineMoreText: {
    ...ui.typography.bodySmall,
    fontWeight: '600',
    color: ui.colors.primary,
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
