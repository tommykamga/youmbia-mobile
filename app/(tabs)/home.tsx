/**
 * Home tab – growth-optimized marketplace entry: brand, search, category rail, feed.
 * Search bar and category pills navigate to Search tab (no inline typing on home).
 * Pull-to-refresh is handled inside ListingFeed.
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Screen, AppLogo, CategoryRail, NotificationsPromptCard } from '@/components';
import { getPublicListings } from '@/services/listings';
import {
  ListingFeed,
  NearYouSection,
  BoostedSection,
  UrgentSection,
  SavedSearchAlertsSection,
  ForYouSection,
  RecentlyViewedSection,
} from '@/features/listings';
import { colors, spacing, typography, fontWeights, radius, shadows } from '@/theme';

/** 5–7 primary categories – tap navigates to search with this query. */
const HOME_CATEGORIES = [
  'Véhicules',
  'Mode',
  'Maison',
  'Électronique',
  'Sport',
  'Loisirs',
  'Autre',
] as const;

export default function HomeScreen() {
  // Prefetch first few listing images for instant feeling
  useFocusEffect(
    React.useCallback(() => {
      getPublicListings(0, 10).then(res => {
        if (res.data) {
          const urls = res.data
            .map(l => (l.images?.[0] ? String(l.images[0]) : null))
            .filter((u): u is string => u != null);
          Image.prefetch(urls);
        }
      });
    }, [])
  );

  return (
    <Screen noPadding>
      <ListingFeed listHeaderComponent={<HomeHeaderContent />} />
    </Screen>
  );
}

function HomeHeaderContent() {
  const router = useRouter();
  const handleSearchPress = () => router.push('/(tabs)/search');
  const handleCategoryPress = (label: string) =>
    router.push(`/(tabs)/search?q=${encodeURIComponent(label)}`);
  const handleVoirToutPress = () => router.push('/categories');

  return (
    <View style={styles.header}>
      <View style={styles.topRow}>
        <AppLogo variant="medium" style={styles.logo} />
      </View>

      <Pressable
        style={({ pressed }) => [styles.searchBar, pressed && styles.searchBarPressed]}
        onPress={handleSearchPress}
        accessibilityRole="button"
        accessibilityLabel="Rechercher"
      >
        <Ionicons name="search" size={22} color={colors.textMuted} style={styles.searchIcon} />
        <Text style={styles.searchPlaceholder}>Rechercher sur YOUMBIA</Text>
      </Pressable>
      <Animated.View entering={FadeInDown.delay(50).duration(400)}>
        <NotificationsPromptCard />
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(100).duration(400)}>
        <CategoryRail
          categories={HOME_CATEGORIES}
          onCategoryPress={handleCategoryPress}
          onVoirToutPress={handleVoirToutPress}
        />
      </Animated.View>

      <BoostedSection />

      <NearYouSection userCity={null} />

      <UrgentSection />

      <SavedSearchAlertsSection />

      <ForYouSection />

      <RecentlyViewedSection />

      <Animated.View entering={FadeInDown.delay(350).duration(400)} style={styles.feedIntro}>
        <Text style={styles.sectionTitle}>Nouvelles annonces</Text>
        <Text style={styles.sectionSubtitle}>Les dernières annonces publiées</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: spacing.xs,
    paddingBottom: spacing.lg,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  logo: {
    alignSelf: 'flex-start',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: radius.full,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xl,
    minHeight: 56,
    ...shadows.sm,
  },
  searchBarPressed: {
    opacity: 0.92,
    backgroundColor: colors.surfaceSubtle,
    transform: [{ scale: 0.98 }],
  },
  searchIcon: {
    marginRight: spacing.sm,
  },
  searchPlaceholder: {
    ...typography.base,
    color: colors.textMuted,
    flex: 1,
  },
  feedIntro: {
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    ...typography.lg,
    fontWeight: fontWeights.bold,
    color: colors.text,
    letterSpacing: -0.3,
  },
  sectionSubtitle: {
    ...typography.sm,
    color: colors.textMuted,
    marginTop: 2,
  },
});
