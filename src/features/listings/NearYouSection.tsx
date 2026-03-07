/**
 * NearYouSection – "Près de vous" block: 4–6 listings from user's city or latest as fallback.
 * Horizontal scroll, ListingCard reuse, optional "Voir plus" to search by city.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { getListingsByCity, getPublicListings } from '@/services/listings';
import { getFavoriteIds, toggleFavorite } from '@/services/favorites';
import { ListingCard } from './ListingCard';
import type { PublicListing } from '@/services/listings';
import { colors, spacing, typography, fontWeights } from '@/theme';

const NEAR_YOU_LIMIT = 6;
const CARD_WIDTH = 168;

export type NearYouSectionProps = {
  /** User city for local listings; when null/empty, show latest listings. */
  userCity?: string | null;
};

export function NearYouSection({ userCity }: NearYouSectionProps) {
  const router = useRouter();
  const [listings, setListings] = useState<PublicListing[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
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
    const fav = await getFavoriteIds();
    if (fav.data) setFavoriteIds(new Set(fav.data));
    setLoading(false);
  }, [userCity]);

  useEffect(() => {
    load();
  }, [load]);

  const handleFavoritePress = useCallback(
    async (listingId: string) => {
      const next = !favoriteIds.has(listingId);
      setFavoriteIds((prev) => {
        const nextSet = new Set(prev);
        if (next) nextSet.add(listingId);
        else nextSet.delete(listingId);
        return nextSet;
      });
      const result = await toggleFavorite(listingId);
      if (result.error) {
        setFavoriteIds((prev) => {
          const reverted = new Set(prev);
          if (next) reverted.delete(listingId);
          else reverted.add(listingId);
          return reverted;
        });
        if (result.error.message === 'Non connecté') {
          router.replace(`/(auth)/login?redirect=${encodeURIComponent('/(tabs)/home')}`);
        }
      }
    },
    [favoriteIds, router]
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
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        style={styles.scroll}
      >
        {listings.map((listing) => (
          <View key={listing.id} style={styles.cardWrap}>
            <ListingCard
              listing={listing}
              isFavorite={favoriteIds.has(listing.id)}
              onFavoritePress={() => handleFavoritePress(listing.id)}
            />
          </View>
        ))}
      </ScrollView>
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
  cardWrap: {
    width: CARD_WIDTH,
    marginRight: spacing.sm,
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
