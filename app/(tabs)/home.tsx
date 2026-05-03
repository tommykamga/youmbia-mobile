/**
 * Home tab – growth-optimized marketplace entry: brand, search, category rail, feed.
 * Search bar and category pills navigate to Search tab (no inline typing on home).
 * Pull-to-refresh is handled inside ListingFeed.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Dimensions } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Extrapolate,
  FadeInDown,
  interpolate,
  runOnJS,
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Screen,
  BrandSymbol,
  CategoryRail,
  NotificationsPromptCard,
  AppSearchBar,
  AppSectionHeader,
  appMarketplaceSurface,
} from '@/components';
import {
  ListingFeed,
  NearYouSection,
  BoostedSection,
  UrgentSection,
  SavedSearchAlertsSection,
  ForYouSection,
  RecentlyViewedSection,
  TopListingsSection,
} from '@/features/listings';
import { spacing, ui, colors, shadows } from '@/theme';
import { useResponsiveLayout, getHomeSearchPlaceholder } from '@/lib/responsiveLayout';
import { getSession } from '@/services/auth';
import { buildAuthGateHref } from '@/lib/authGateNavigation';
import { useUnreadMessagesCount } from '@/hooks/useUnreadMessagesCount';
import { LISTING_CATEGORIES } from '@/lib/listingCategories';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const HORIZONTAL_PADDING = 16;

const AnimatedText = Animated.createAnimatedComponent(Text);

const HOME_CATEGORIES = LISTING_CATEGORIES.map((c) => ({
  id: String(c.id),
  label: c.label,
}));

/**
 * Header content for the Home screen.
 * Contains Hero, Search, Categories, and specialized sections.
 */
function HomeHeaderContent({
  scrollY,
}: {
  scrollY: SharedValue<number>;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isCompact } = useResponsiveLayout();
  const { count: unreadCount } = useUnreadMessagesCount();

  const [stickySearchActive, setStickySearchActive] = useState(false);

  // Constants
  const HERO_HEIGHT = 130;
  const HEADER_END_POINT = HERO_HEIGHT + 20;

  // Logo Animation
  const logoScale = useSharedValue(0.97);
  React.useEffect(() => {
    logoScale.value = withTiming(1, { 
      duration: 300, 
      easing: Easing.out(Easing.ease) 
    });
  }, []);

  const logoLoadStyle = useAnimatedStyle(() => ({
    transform: [{ scale: logoScale.value }],
  }));

  // Search press handler
  const onSearchPress = useCallback(() => {
    router.push('/(tabs)/search');
  }, [router]);

  // Category handlers
  const handleCategoryPress = useCallback(
    (cat: { id: string; label: string }) => {
      router.push({
        pathname: '/(tabs)/search',
        params: { categoryId: cat.id, categoryName: cat.label },
      });
    },
    [router]
  );

  const handleVoirToutPress = useCallback(() => {
    router.push('/(tabs)/search');
  }, [router]);

  const handleSellCtaPress = useCallback(async () => {
    const session = await getSession();
    if (session) {
      router.push('/sell');
    } else {
      const authHref = buildAuthGateHref({
        context: 'sell',
        returnPath: '/sell' as Href,
      });
      router.push(authHref);
    }
  }, [router]);

  // Sticky Search Reaction
  useAnimatedReaction(
    () => scrollY.value,
    (current) => {
      const shouldBeSticky = current > HEADER_END_POINT;
      if (shouldBeSticky !== stickySearchActive) {
        runOnJS(setStickySearchActive)(shouldBeSticky);
      }
    }
  );

  // Hero Animations
  const heroAnimStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      scrollY.value,
      [0, HEADER_END_POINT * 0.6],
      [1, 0],
      Extrapolate.CLAMP
    );
    const translateY = interpolate(
      scrollY.value,
      [0, HEADER_END_POINT],
      [0, -20],
      Extrapolate.CLAMP
    );
    return { opacity, transform: [{ translateY }] };
  });

  const taglineAnimStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      scrollY.value,
      [0, HEADER_END_POINT * 0.4],
      [1, 0],
      Extrapolate.CLAMP
    );
    return { opacity };
  });

  const inlineSearchAnimStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      scrollY.value,
      [HEADER_END_POINT * 0.7, HEADER_END_POINT],
      [1, 0],
      Extrapolate.CLAMP
    );
    return { opacity };
  });

  const searchPlaceholder = getHomeSearchPlaceholder();
  const railEdge = HORIZONTAL_PADDING;

  return (
    <View style={styles.headerRoot}>
      <LinearGradient
        colors={['#6EDC5F', '#E9FBEF']}
        style={styles.heroGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      />

      <View style={[styles.topActionsRow, { top: insets.top + 8 }]}>
        <View style={styles.topActionsSpacer} />
        <Pressable
          onPress={() => router.push('/messages')}
          style={({ pressed }) => [styles.topIconBtn, pressed && styles.topIconBtnPressed]}
          accessibilityLabel="Messages"
        >
          <View style={styles.topIconBadgeWrap}>
            <Ionicons name="chatbubble-outline" size={24} color={colors.textPrimary} />
            {unreadCount > 0 ? (
              <View style={styles.topIconBadge}>
                <Text style={styles.topIconBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
              </View>
            ) : null}
          </View>
        </Pressable>
      </View>

      <Animated.View style={[styles.hero, heroAnimStyle]} accessibilityRole="header">
        <Animated.View 
          entering={FadeInDown.delay(50).duration(300).springify().damping(12)}
          style={[styles.logoWrapper, logoLoadStyle]}
        >
          <BrandSymbol size={95} />
        </Animated.View>
        <Text style={styles.brandName}>YOUMBIA</Text>
        <AnimatedText style={[styles.tagline, taglineAnimStyle]}>
          Le marché qui vous élève
        </AnimatedText>
      </Animated.View>

      <Animated.View
        style={inlineSearchAnimStyle}
        pointerEvents={stickySearchActive ? 'none' : 'auto'}
      >
        <AppSearchBar
          placeholder={searchPlaceholder}
          onPress={onSearchPress}
          compact={isCompact}
          style={styles.searchBarSpacing}
        />
      </Animated.View>

      {/* Categories follow search immediately */}
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
            appMarketplaceSurface,
            styles.sellCtaLayout,
            styles.sellCtaCompact,
            pressed && styles.sellCtaPressed,
          ]}
          onPress={handleSellCtaPress}
          accessibilityRole="button"
          accessibilityLabel="Vendre un article"
        >
          <View style={styles.sellCtaTextBlock}>
            <Text style={styles.sellCtaTitle} numberOfLines={1} ellipsizeMode="tail">
              Vendez facilement
            </Text>
            <Text style={styles.sellCtaSubtitle} numberOfLines={1}>
              Publiez en 30 secondes
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color={ui.colors.primary} style={{ opacity: 0.9 }} />
        </Pressable>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(145).duration(400)}>
        <TopListingsSection />
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(150).duration(400)} style={styles.feedIntro}>
        <AppSectionHeader
          title="Nouvelles annonces"
          subtitle="Actualisées en continu, triées par défaut"
        />
      </Animated.View>
    </View>
  );
}

export default function HomeScreen() {
  const scrollY = useSharedValue(0);
  const insets = useSafeAreaInsets();
  const { isCompact } = useResponsiveLayout();
  const router = useRouter();

  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  const stickySearchActive = useSharedValue(0);

  useAnimatedReaction(
    () => scrollY.value,
    (current) => {
      stickySearchActive.value = current > 200 ? 1 : 0;
    }
  );

  const stickySearchStyle = useAnimatedStyle(() => {
    return {
      opacity: interpolate(stickySearchActive.value, [0, 1], [0, 1]),
      transform: [{ translateY: interpolate(stickySearchActive.value, [0, 1], [-20, 0]) }],
    };
  });

  const searchPlaceholder = getHomeSearchPlaceholder();

  return (
    <Screen style={styles.container}>
      <Animated.View
        style={[
          styles.stickySearchWrap,
          { paddingTop: insets.top + 4 },
          stickySearchStyle,
        ]}
        pointerEvents="box-none"
      >
        <AppSearchBar
          placeholder={searchPlaceholder}
          onPress={() => {}}
          compact={isCompact}
          style={styles.stickySearchBar}
        />
      </Animated.View>

      <ListingFeed
        listHeaderComponent={<HomeHeaderContent scrollY={scrollY} />}
        reanimatedScrollHandler={onScroll}
        listingCardFeedPresentation="home"
        contentPaddingHorizontal={HORIZONTAL_PADDING}
        limit={6}
        footerAction={{ label: 'Voir plus d\'annonces', onPress: () => router.push('/search') }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  headerRoot: {
    paddingTop: 10,
    marginTop: 0,
    paddingBottom: ui.spacing.lg,
    overflow: 'hidden',
  },
  heroGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 380,
    opacity: 0.85,
  },
  topActionsRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    paddingHorizontal: HORIZONTAL_PADDING,
    zIndex: 10,
  },
  topActionsSpacer: {
    flex: 1,
  },
  topIconBtn: {
    padding: spacing.xs,
  },
  topIconBtnPressed: {
    opacity: 0.7,
  },
  topIconBadgeWrap: {
    position: 'relative',
  },
  topIconBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: colors.error,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  topIconBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  hero: {
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 16,
    paddingHorizontal: HORIZONTAL_PADDING,
  },
  logoWrapper: {
    padding: 2,
    marginBottom: -4,
    shadowColor: '#6EDC5F',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 4,
  },
  brandName: {
    ...ui.typography.h2,
    fontSize: 20,
    color: ui.colors.textPrimary,
    letterSpacing: -0.2,
    marginTop: 2,
  },
  tagline: {
    ...ui.typography.bodySmall,
    color: ui.colors.textSecondary,
    fontSize: 12,
    marginTop: -2,
    opacity: 0.8,
  },
  searchBarSpacing: {
    marginHorizontal: HORIZONTAL_PADDING,
    marginTop: 4,
    marginBottom: 12,
  },
  sellCtaLayout: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F2FFF5',
    paddingVertical: ui.spacing.lg + 8,
    paddingHorizontal: ui.spacing.xl + 4,
    borderRadius: 24,
    marginBottom: ui.spacing.xl + 8,
    marginTop: ui.spacing.md,
    marginHorizontal: HORIZONTAL_PADDING,
    borderWidth: 1,
    borderColor: 'rgba(22, 163, 74, 0.08)',
    ...shadows.sm,
  },
  sellCtaCompact: {
    paddingVertical: ui.spacing.sm + 10,
  },
  sellCtaPressed: {
    opacity: 0.95,
    backgroundColor: '#E9FBEF',
  },
  sellCtaTextBlock: {
    flex: 1,
    gap: 2,
  },
  sellCtaTitle: {
    ...ui.typography.h3,
    color: ui.colors.textPrimary,
    fontSize: 18,
  },
  sellCtaSubtitle: {
    ...ui.typography.bodySmall,
    color: ui.colors.textSecondary,
    opacity: 0.8,
  },
  feedIntro: {
    marginTop: ui.spacing.xl,
    marginBottom: ui.spacing.md,
    paddingHorizontal: HORIZONTAL_PADDING,
  },
  stickySearchWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    zIndex: 20,
    paddingBottom: 6,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(15, 23, 42, 0.06)',
  },
  stickySearchBar: {
    marginHorizontal: HORIZONTAL_PADDING,
    marginTop: 2,
    marginBottom: 0,
  },
});
