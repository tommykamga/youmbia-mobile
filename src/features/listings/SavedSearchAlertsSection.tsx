/**
 * Saved search alerts – local/lightweight home section.
 * Shows recent listings matching saved searches, without push notifications.
 */

import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { getPublicListings } from '@/services/listings';
import { buildSavedSearchHref, getSavedSearches, type SavedSearch } from '@/services/savedSearches';
import { getSavedSearchAlertMatches } from '@/services/savedSearchAlerts';
import { ListingCard } from './ListingCard';
import type { PublicListing } from '@/services/listings';
import { colors, spacing, typography, fontWeights, radius } from '@/theme';
import { useCardWidth } from '@/hooks/useCardWidth';

const ALERT_LIMIT = 3;
const ALERT_FETCH_LIMIT = 24;
const INITIAL_NUM_TO_RENDER = 3;

function buildSubtitle(matchCount: number, searchCount: number): string {
  if (matchCount <= 0 || searchCount <= 0) return '';
  const annonces = matchCount > 1 ? 'annonces' : 'annonce';
  const recherches = searchCount > 1 ? 'recherches' : 'recherche';
  return `${matchCount} nouvelle${matchCount > 1 ? 's' : ''} ${annonces} pour ${searchCount} ${recherches} enregistrée${searchCount > 1 ? 's' : ''}.`;
}

export function SavedSearchAlertsSection() {
  const router = useRouter();
  const cardWidth = useCardWidth();
  const ITEM_WIDTH = cardWidth + spacing.sm;
  const [listings, setListings] = useState<PublicListing[]>([]);
  const [subtitle, setSubtitle] = useState('');
  const [topSearch, setTopSearch] = useState<SavedSearch | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const savedSearches = getSavedSearches().slice(0, 8);
      if (savedSearches.length === 0) {
        setListings([]);
        setSubtitle('');
        setTopSearch(null);
        return;
      }

      const feedResult = await getPublicListings(0, ALERT_FETCH_LIMIT);

      const matches = getSavedSearchAlertMatches(feedResult.data ?? [], savedSearches);
      if (matches.length === 0) {
        setListings([]);
        setSubtitle('');
        setTopSearch(null);
        return;
      }

      const nextListings = matches.slice(0, ALERT_LIMIT).map((item) => item.listing);
      const matchedSearchIds = new Set(matches.flatMap((item) => item.searchIds));
      setListings(nextListings);
      setSubtitle(buildSubtitle(nextListings.length, matchedSearchIds.size));
      setTopSearch(savedSearches.find((item) => matchedSearchIds.has(item.id)) ?? savedSearches[0] ?? null);
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
      <View style={{ width: cardWidth }}>
        <ListingCard listing={item} />
      </View>
    ),
    [cardWidth]
  );

  const handleSeeMatches = useCallback(() => {
    if (!topSearch) return;
    router.push(buildSavedSearchHref(topSearch) as never);
  }, [router, topSearch]);

  if (loading || listings.length === 0) {
    return null;
  }

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <View style={styles.headerBody}>
          <View style={styles.titleRow}>
            <Ionicons
              name="notifications-outline"
              size={18}
              color={colors.textMuted}
              style={styles.titleIcon}
            />
            <Text style={styles.title}>Nouveautés pour vos recherches</Text>
          </View>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>
        {topSearch ? (
          <Pressable
            style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]}
            onPress={handleSeeMatches}
          >
            <Text style={styles.actionText}>Voir</Text>
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
        ItemSeparatorComponent={() => <View style={{ width: spacing.sm }} />}
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
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  headerBody: {
    flex: 1,
    minWidth: 0,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
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
  subtitle: {
    ...typography.xs,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  actionBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  actionBtnPressed: {
    opacity: 0.85,
  },
  actionText: {
    ...typography.xs,
    color: colors.text,
    fontWeight: fontWeights.semibold,
  },
  scroll: {
    marginHorizontal: -spacing.base,
  },
  scrollContent: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.sm,
  },
});
