/**
 * Pour vous – recommandations locales, basées sur recherches, favoris et consultations.
 * Sans backend dédié : scoring explicable + fallback vers annonces récentes.
 */

import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { getPublicListings } from '@/services/listings';
import { getFavoriteIds, getFavorites } from '@/services/favorites';
import { getRecentlyViewedListingIds } from '@/services/recentlyViewed';
import { getSavedSearches, type SavedSearch } from '@/services/savedSearches';
import { getListingsByIds } from '@/services/listings/getListingsByIds';
import { ListingCard, LISTING_CARD_RAIL_STRIDE } from './ListingCard';
import type { PublicListing } from '@/services/listings';
import { colors, spacing, typography, ui } from '@/theme';
import { ListingSectionSkeleton } from './ListingSectionSkeleton';

const FOR_YOU_LIMIT = 6;
const FOR_YOU_FETCH_LIMIT = 24;
const INITIAL_NUM_TO_RENDER = 4;
const CATEGORY_OPTIONS = ['Véhicules', 'Mode', 'Maison', 'Électronique', 'Sport', 'Loisirs', 'Autre'] as const;

type RecommendationSignals = {
  savedSearches: SavedSearch[];
  favoriteListings: PublicListing[];
  recentListings: PublicListing[];
  recentIds: string[];
};

function normalizeText(value: string | null | undefined): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function getCategoryMatchScore(listing: PublicListing, savedSearches: SavedSearch[]): number {
  const listingText = normalizeText(`${listing.title} ${listing.description ?? ''}`);
  if (!listingText) return 0;
  const explicitCategories = savedSearches
    .map((item) => item.category)
    .filter((value): value is string => !!value?.trim());

  let score = 0;
  explicitCategories.forEach((category) => {
    if (listingText.includes(normalizeText(category))) {
      score += 5;
    }
  });

  // Support home/category navigations that may have been saved as raw query only.
  savedSearches.forEach((item) => {
    const query = normalizeText(item.query);
    if (CATEGORY_OPTIONS.some((option) => normalizeText(option) === query) && listingText.includes(query)) {
      score += 3;
    }
  });

  return score;
}

function getQueryMatchScore(listing: PublicListing, savedSearches: SavedSearch[]): number {
  const listingText = normalizeText(`${listing.title} ${listing.description ?? ''} ${listing.city}`);
  if (!listingText) return 0;

  return savedSearches.reduce((total, item) => {
    const query = normalizeText(item.query);
    if (!query || query.length < 2) return total;
    if (CATEGORY_OPTIONS.some((option) => normalizeText(option) === query)) return total;
    if (listingText.includes(query)) return total + 4;

    const matchingTokens = query
      .split(/\s+/)
      .filter((token) => token.length >= 4 && listingText.includes(token)).length;
    return total + Math.min(2, matchingTokens);
  }, 0);
}

function getCityMatchScore(listing: PublicListing, signals: RecommendationSignals): number {
  const listingCity = normalizeText(listing.city);
  if (!listingCity) return 0;

  let score = 0;
  signals.savedSearches.forEach((item) => {
    if (normalizeText(item.city) === listingCity) score += 4;
  });
  signals.favoriteListings.forEach((item) => {
    if (normalizeText(item.city) === listingCity) score += 3;
  });
  signals.recentListings.forEach((item) => {
    if (normalizeText(item.city) === listingCity) score += 2;
  });
  return score;
}

function buildRecommendationSubtitle(signals: RecommendationSignals): string {
  const hasSaved = signals.savedSearches.length > 0;
  const hasFavorites = signals.favoriteListings.length > 0;
  const hasRecent = signals.recentListings.length > 0;

  if (hasSaved && (hasFavorites || hasRecent)) {
    return 'Basé sur vos recherches, favoris et annonces consultées';
  }
  if (hasSaved) {
    return 'Basé sur vos recherches enregistrées';
  }
  if (hasFavorites || hasRecent) {
    return 'Basé sur vos favoris et annonces consultées';
  }
  return 'Une sélection récente à découvrir';
}

export function ForYouSection() {
  const ITEM_WIDTH = LISTING_CARD_RAIL_STRIDE;
  const [listings, setListings] = useState<PublicListing[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [subtitle, setSubtitle] = useState('Une sélection récente à découvrir');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [feedResult, favoriteIdsResult, favoritesResult] = await Promise.all([
        getPublicListings(0, FOR_YOU_FETCH_LIMIT),
        getFavoriteIds(),
        getFavorites(),
      ]);

      if (favoriteIdsResult.data) {
        setFavoriteIds(new Set(favoriteIdsResult.data));
      }

      const recentIds = getRecentlyViewedListingIds();
      const recentResult = recentIds.length > 0 ? await getListingsByIds(recentIds.slice(0, 8)) : { data: [], error: null };

      const signals: RecommendationSignals = {
        savedSearches: getSavedSearches().slice(0, 8),
        favoriteListings: favoritesResult.data ?? [],
        recentListings: recentResult.data ?? [],
        recentIds,
      };

      const candidates = feedResult.data ?? [];
      const recentSet = new Set(signals.recentIds);
      const scored = candidates
        .filter((item) => !recentSet.has(item.id))
        .map((item, index) => {
          const score =
            getCategoryMatchScore(item, signals.savedSearches) +
            getQueryMatchScore(item, signals.savedSearches) +
            getCityMatchScore(item, signals);
          return { item, score, index };
        })
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          return a.index - b.index;
        });

      const personalized = scored.filter((entry) => entry.score > 0).map((entry) => entry.item);
      const fallback = scored.filter((entry) => entry.score === 0).map((entry) => entry.item);
      const nextListings = [...personalized, ...fallback].slice(0, FOR_YOU_LIMIT);

      setListings(nextListings);
      setSubtitle(buildRecommendationSubtitle(signals));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const keyExtractor = useCallback((item: PublicListing) => item.id, []);
  const renderItem = useCallback(
    ({ item }: { item: PublicListing }) => (
      <ListingCard listing={item} variant="rail" />
    ),
    []
  );

  if (loading) {
    return (
      <ListingSectionSkeleton
        title="Recommandé pour vous"
        icon="sparkles-outline"
        iconColor={colors.primary}
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
          <Ionicons name="sparkles-outline" size={20} color={colors.primary} style={styles.titleIcon} />
          <Text style={styles.title}>Recommandé pour vous</Text>
        </View>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
      <FlatList
        data={listings}
        extraData={favoriteIds}
        keyExtractor={keyExtractor}
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
        renderItem={renderItem}
      />
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
    ...ui.typography.h2,
    letterSpacing: -0.35,
    color: ui.colors.textPrimary,
    flex: 1,
  },
  subtitle: {
    ...typography.sm,
    color: colors.textMuted,
    marginTop: spacing.xs,
    marginLeft: 28,
    marginBottom: spacing.sm,
  },
  scroll: {
    marginHorizontal: -spacing.base,
  },
  scrollContent: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.sm,
  },
});
