/**
 * Section "Top annonces" – Affiche 2 ou 3 annonces premium avec un design distinct.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Dimensions } from 'react-native';
import { getPublicListings, type PublicListing } from '@/services/listings';
import { ListingCard } from './ListingCard';
import { spacing, ui } from '@/theme';
import { ListingSectionSkeleton } from './ListingSectionSkeleton';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const HORIZONTAL_PADDING = 16;
// On veut voir 85% de la carte actuelle
const CARD_WIDTH = SCREEN_WIDTH * 0.85;
const ITEM_SPACING = 12;
const ITEM_STRIDE = CARD_WIDTH + ITEM_SPACING;

export function TopListingsSection() {
  const [listings, setListings] = useState<PublicListing[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    // On récupère les 10 premières annonces pour en extraire les "tops" (prix élevé)
    const result = await getPublicListings(0, 10);
    if (result.data) {
      // Critère simple : tri par prix décroissant pour les 3 premières
      const sorted = [...result.data].sort((a, b) => (b.price || 0) - (a.price || 0));
      setListings(sorted.slice(0, 3));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return <ListingSectionSkeleton title="Top annonces" icon="flame" />;
  }

  if (listings.length === 0) return null;

  return (
    <View style={styles.section}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>🔥 Top annonces</Text>
      </View>
      <FlatList
        data={listings}
        keyExtractor={(item) => `top-${item.id}`}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        style={styles.scroll}
        snapToInterval={ITEM_STRIDE}
        snapToAlignment="start"
        decelerationRate="fast"
        getItemLayout={(_, index) => ({
          length: ITEM_STRIDE,
          offset: index * ITEM_STRIDE,
          index,
        })}
        renderItem={({ item, index }) => (
          <View style={[
            styles.card,
            index < listings.length - 1 && { marginRight: ITEM_SPACING },
          ]}>
            <ListingCard listing={item} variant="top" />
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: spacing.xl,
    marginTop: spacing.sm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: HORIZONTAL_PADDING,
  },
  title: {
    ...ui.typography.h2,
    color: ui.colors.textPrimary,
    fontWeight: '800',
    fontSize: 20,
    letterSpacing: -0.6,
  },
  scroll: {
    marginHorizontal: 0,
  },
  scrollContent: {
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingBottom: spacing.md,
  },
  card: {
    width: CARD_WIDTH,
    aspectRatio: 1.4,
  },
});
