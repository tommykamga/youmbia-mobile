/**
 * Home tab – growth-optimized marketplace entry: brand, search, category rail, feed.
 * Search bar and category pills navigate to Search tab (no inline typing on home).
 * Pull-to-refresh is handled inside ListingFeed.
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Screen, AppLogo, CategoryRail } from '@/components';
import { ListingFeed, NearYouSection } from '@/features/listings';
import { colors, spacing, typography, fontWeights, radius } from '@/theme';

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
  return (
    <Screen>
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
      <AppLogo variant="medium" style={styles.logo} />
      <Pressable
        style={({ pressed }) => [styles.searchBar, pressed && styles.searchBarPressed]}
        onPress={handleSearchPress}
        accessibilityRole="button"
        accessibilityLabel="Rechercher"
      >
        <Ionicons name="search" size={22} color={colors.textMuted} style={styles.searchIcon} />
        <Text style={styles.searchPlaceholder}>Rechercher sur YOUMBIA</Text>
      </Pressable>
      <CategoryRail
        categories={HOME_CATEGORIES}
        onCategoryPress={handleCategoryPress}
        onVoirToutPress={handleVoirToutPress}
      />
      <NearYouSection userCity={null} />
      <View style={styles.feedIntro}>
        <Text style={styles.sectionTitle}>Nouvelles annonces</Text>
        <Text style={styles.sectionSubtitle}>Les dernières annonces publiées</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  logo: {
    marginBottom: spacing.lg,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: radius['2xl'],
    paddingVertical: spacing.base,
    paddingHorizontal: spacing.base,
    marginBottom: spacing.lg,
    minHeight: 52,
  },
  searchBarPressed: {
    opacity: 0.92,
    backgroundColor: colors.surfaceMuted,
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
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    ...typography.sm,
    fontWeight: fontWeights.bold,
    color: colors.text,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionSubtitle: {
    ...typography.xs,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
});
