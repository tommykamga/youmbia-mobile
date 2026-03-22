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
import { useResponsiveLayout, getHomeSearchPlaceholder } from '@/lib/responsiveLayout';

/** Catégories principales (ordre = intention d’achat) — tap → recherche. */
const HOME_CATEGORIES = [
  'Véhicules',
  'Électronique',
  'Maison',
  'Mode',
  'Sport',
  'Loisirs',
  'Autre',
] as const;

export default function HomeScreen() {
  const { bucket } = useResponsiveLayout();
  const contentPaddingHorizontal = bucket === 'compact' ? spacing.sm : spacing.base;

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
      <ListingFeed
        listHeaderComponent={<HomeHeaderContent />}
        contentPaddingHorizontal={contentPaddingHorizontal}
      />
    </Screen>
  );
}

function HomeHeaderContent() {
  const router = useRouter();
  const { bucket, isCompact } = useResponsiveLayout();
  const searchPlaceholder = getHomeSearchPlaceholder(bucket);
  const railEdge = isCompact ? spacing.sm : spacing.base;
  const handleSearchPress = () => router.push('/(tabs)/search');
  const handleCategoryPress = (label: string) =>
    router.push(`/(tabs)/search?q=${encodeURIComponent(label)}`);
  const handleVoirToutPress = () => router.push('/categories');
  const handleSellCtaPress = () => router.push('/(tabs)/sell');

  return (
    <View style={[styles.header, isCompact && styles.headerCompact]}>
      <View style={[styles.topRow, isCompact && styles.topRowCompact]}>
        <AppLogo variant={isCompact ? 'small' : 'medium'} style={styles.logo} />
      </View>

      <Pressable
        style={({ pressed }) => [
          styles.searchBar,
          isCompact && styles.searchBarCompact,
          pressed && styles.searchBarPressed,
        ]}
        onPress={handleSearchPress}
        accessibilityRole="button"
        accessibilityLabel="Rechercher"
      >
        <Ionicons
          name="search"
          size={isCompact ? 20 : 22}
          color={colors.textSecondary}
          style={styles.searchIcon}
        />
        <Text
          style={[styles.searchPlaceholder, isCompact && styles.searchPlaceholderCompact]}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {searchPlaceholder}
        </Text>
      </Pressable>
      <Animated.View entering={FadeInDown.delay(50).duration(400)}>
        <NotificationsPromptCard />
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(100).duration(400)}>
        <CategoryRail
          categories={HOME_CATEGORIES}
          onCategoryPress={handleCategoryPress}
          onVoirToutPress={handleVoirToutPress}
          edgePadding={railEdge}
        />
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(120).duration(400)}>
        <Pressable
          style={({ pressed }) => [
            styles.sellCta,
            isCompact && styles.sellCtaCompact,
            pressed && styles.sellCtaPressed,
          ]}
          onPress={handleSellCtaPress}
          accessibilityRole="button"
          accessibilityLabel="Vendre un article"
        >
          <View style={styles.sellCtaTextBlock}>
            <Text style={styles.sellCtaTitle} numberOfLines={2} ellipsizeMode="tail">
              {isCompact ? 'Quelque chose à vendre ?' : 'Vous avez quelque chose à vendre ?'}
            </Text>
            <Text style={styles.sellCtaSubtitle} numberOfLines={1}>
              Publiez en 30 secondes
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.primary} />
        </Pressable>
      </Animated.View>

      <BoostedSection />

      <NearYouSection userCity={null} />

      <UrgentSection />

      <SavedSearchAlertsSection />

      <ForYouSection />

      <RecentlyViewedSection />

      <Animated.View entering={FadeInDown.delay(350).duration(400)} style={styles.feedIntro}>
        <Text style={styles.sectionTitle}>Nouvelles annonces</Text>
        <Text style={styles.sectionSubtitle}>Actualisées en continu, triées par défaut</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: spacing.xs,
    paddingBottom: spacing.lg,
  },
  headerCompact: {
    paddingBottom: spacing.md,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  topRowCompact: {
    marginBottom: spacing.md,
  },
  logo: {
    alignSelf: 'flex-start',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    paddingVertical: spacing.md + 2,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xl,
    minHeight: 52,
    ...shadows.card,
  },
  searchBarCompact: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.lg,
    minHeight: 48,
  },
  searchBarPressed: {
    opacity: 0.94,
    backgroundColor: colors.surfaceSubtle,
    transform: [{ scale: 0.985 }],
  },
  searchIcon: {
    marginRight: spacing.sm,
  },
  searchPlaceholder: {
    ...typography.base,
    color: colors.textSecondary,
    flex: 1,
    minWidth: 0,
  },
  searchPlaceholderCompact: {
    fontSize: typography.sm.fontSize,
    lineHeight: 20,
  },
  sellCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    marginBottom: spacing.lg,
    marginTop: -spacing.xs,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.surfaceSubtle,
  },
  sellCtaCompact: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.md,
  },
  sellCtaPressed: {
    opacity: 0.92,
    backgroundColor: colors.primaryLight + '55',
  },
  sellCtaTextBlock: {
    flex: 1,
    marginRight: spacing.sm,
  },
  sellCtaTitle: {
    ...typography.sm,
    fontWeight: fontWeights.semibold,
    color: colors.text,
  },
  sellCtaSubtitle: {
    ...typography.xs,
    color: colors.textMuted,
    marginTop: 2,
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
