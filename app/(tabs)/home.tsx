/**
 * Home tab – growth-optimized marketplace entry: brand, search, category rail, feed.
 * Search bar and category pills navigate to Search tab (no inline typing on home).
 * Pull-to-refresh is handled inside ListingFeed.
 */

import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, {
  Extrapolate,
  FadeInDown,
  interpolate,
  runOnJS,
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
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
} from '@/features/listings';
import { spacing, ui, colors } from '@/theme';
import { useResponsiveLayout, getHomeSearchPlaceholder } from '@/lib/responsiveLayout';
import { getSession } from '@/services/auth';
import { buildAuthGateHref } from '@/lib/authGateNavigation';
import { useUnreadMessagesCount } from '@/hooks/useUnreadMessagesCount';

const AnimatedText = Animated.createAnimatedComponent(Text);

/** Scroll (px, clampé ≥ 0) — plage un peu longue = shrink plus progressif, moins « compressé ». */
const HERO_SHRINK_RANGE = 100;
/** Barre inline disparaît en premier (évite deux champs lisibles en même temps). */
const INLINE_SEARCH_FADE_START = 118;
const INLINE_SEARCH_FADE_END = 140;
/** Sticky apparaît légèrement après le début de la sortie inline (chevauchement court). */
const STICKY_SEARCH_FADE_START = 128;
const STICKY_SEARCH_FADE_END = 158;
/** Tap : quand le sticky est assez présent (~40 %) et l’inline déjà quasi sorti. */
const STICKY_POINTER_THRESHOLD = 138;

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
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { bucket } = useResponsiveLayout();
  const contentPaddingHorizontal = bucket === 'compact' ? spacing.sm : spacing.base;
  const searchPlaceholder = getHomeSearchPlaceholder(bucket);
  const scrollY = useSharedValue(0);
  const stickyGate = useSharedValue(0);
  const [stickySearchActive, setStickySearchActive] = useState(false);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;
    },
  });

  useAnimatedReaction(
    () => (Math.max(0, scrollY.value) >= STICKY_POINTER_THRESHOLD ? 1 : 0),
    (gate) => {
      if (gate !== stickyGate.value) {
        stickyGate.value = gate;
        runOnJS(setStickySearchActive)(gate === 1);
      }
    }
  );

  const handleSearchPress = useCallback(() => {
    router.push('/(tabs)/search');
  }, [router]);

  return (
    <Screen noPadding>
      <View style={styles.shell}>
        <HomeStickySearchOverlay
          scrollY={scrollY}
          safeTop={insets.top}
          contentPaddingHorizontal={contentPaddingHorizontal}
          compact={bucket === 'compact'}
          placeholder={searchPlaceholder}
          onPress={handleSearchPress}
          stickySearchActive={stickySearchActive}
        />
        <ListingFeed
          reanimatedScrollHandler={scrollHandler}
          listHeaderComponent={
            <HomeHeaderContent
              scrollY={scrollY}
              contentPaddingHorizontal={contentPaddingHorizontal}
              searchPlaceholder={searchPlaceholder}
              onSearchPress={handleSearchPress}
              stickySearchActive={stickySearchActive}
            />
          }
          contentPaddingHorizontal={contentPaddingHorizontal}
          listingCardFeedPresentation="home"
        />
      </View>
    </Screen>
  );
}

type HomeStickySearchOverlayProps = {
  scrollY: SharedValue<number>;
  safeTop: number;
  contentPaddingHorizontal: number;
  compact: boolean;
  placeholder: string;
  onPress: () => void;
  stickySearchActive: boolean;
};

function HomeStickySearchOverlay({
  scrollY,
  safeTop,
  contentPaddingHorizontal,
  compact,
  placeholder,
  onPress,
  stickySearchActive,
}: HomeStickySearchOverlayProps) {
  const fadeStyle = useAnimatedStyle(() => {
    const y = Math.max(0, scrollY.value);
    const o = interpolate(
      y,
      [STICKY_SEARCH_FADE_START, STICKY_SEARCH_FADE_END],
      [0, 1],
      Extrapolate.CLAMP
    );
    return { opacity: o };
  });

  return (
    <Animated.View
      pointerEvents={stickySearchActive ? 'box-none' : 'none'}
      style={[
        styles.stickySearchWrap,
        {
          paddingTop: safeTop + 6,
          paddingHorizontal: contentPaddingHorizontal,
          backgroundColor: colors.surface,
        },
        fadeStyle,
      ]}
    >
      <AppSearchBar
        placeholder={placeholder}
        onPress={onPress}
        compact={compact}
        style={styles.stickySearchBar}
      />
    </Animated.View>
  );
}

type HomeHeaderContentProps = {
  scrollY: SharedValue<number>;
  contentPaddingHorizontal: number;
  searchPlaceholder: string;
  onSearchPress: () => void;
  stickySearchActive: boolean;
};

function HomeHeaderContent({
  scrollY,
  contentPaddingHorizontal,
  searchPlaceholder,
  onSearchPress,
  stickySearchActive,
}: HomeHeaderContentProps) {
  const router = useRouter();
  const unreadMessages = useUnreadMessagesCount();
  const { isCompact } = useResponsiveLayout();
  const railEdge = isCompact ? spacing.sm : spacing.base;
  const handleCategoryPress = (label: string) =>
    router.push(`/(tabs)/search?q=${encodeURIComponent(label)}`);
  const handleVoirToutPress = () => router.push('/categories');
  const handleSellCtaPress = useCallback(async () => {
    try {
      const session = await getSession();
      if (session?.user) {
        router.push('/sell' as Href);
      } else {
        router.push(buildAuthGateHref('sell'));
      }
    } catch {
      router.push(buildAuthGateHref('sell'));
    }
  }, [router]);

  const handleMessagesPress = useCallback(async () => {
    try {
      const session = await getSession();
      if (session?.user) {
        router.push('/(tabs)/messages' as Href);
      } else {
        router.push(buildAuthGateHref('messages'));
      }
    } catch {
      router.push(buildAuthGateHref('messages'));
    }
  }, [router]);

  const heroAnimStyle = useAnimatedStyle(() => {
    const y = Math.max(0, scrollY.value);
    const t = interpolate(y, [0, HERO_SHRINK_RANGE], [0, 1], Extrapolate.CLAMP);
    return {
      transform: [{ scale: 1 - 0.028 * t }],
      marginBottom: interpolate(y, [0, HERO_SHRINK_RANGE], [8, 5], Extrapolate.CLAMP),
    };
  });

  const taglineAnimStyle = useAnimatedStyle(() => {
    const y = Math.max(0, scrollY.value);
    const t = interpolate(y, [0, HERO_SHRINK_RANGE], [0, 1], Extrapolate.CLAMP);
    return { opacity: 1 - 0.12 * t };
  });

  const inlineSearchAnimStyle = useAnimatedStyle(() => {
    const y = Math.max(0, scrollY.value);
    return {
      opacity: interpolate(
        y,
        [INLINE_SEARCH_FADE_START, INLINE_SEARCH_FADE_END],
        [1, 0],
        Extrapolate.CLAMP
      ),
    };
  });

  return (
    <View style={[styles.headerRoot, isCompact && styles.headerRootCompact]}>
      <View
        style={[
          styles.header,
          {
            marginHorizontal: -contentPaddingHorizontal,
            paddingHorizontal: spacing.lg,
          },
        ]}
      >
        <Pressable
          onPress={() => void handleMessagesPress()}
          style={({ pressed }) => [styles.messagesHit, pressed && styles.messagesHitPressed]}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Messages"
        >
          <View style={styles.messagesIconSlot}>
            <Ionicons name="chatbubble-outline" size={22} color={ui.colors.textSecondary} />
            {unreadMessages > 0 ? (
              <View style={styles.messagesBadge} accessibilityElementsHidden>
                <Text style={styles.messagesBadgeText}>
                  {unreadMessages > 9 ? '9+' : String(unreadMessages)}
                </Text>
              </View>
            ) : null}
          </View>
        </Pressable>
      </View>

      <Animated.View style={[styles.hero, heroAnimStyle]} accessibilityRole="header">
        <View style={styles.logoWrapper}>
          <BrandSymbol size={58} />
        </View>
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
            appMarketplaceSurface,
            styles.sellCtaLayout,
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
          <Ionicons name="chevron-forward" size={18} color={ui.colors.primary} />
        </Pressable>
      </Animated.View>

      <BoostedSection />

      <NearYouSection userCity={null} />

      <UrgentSection />

      <SavedSearchAlertsSection />

      <ForYouSection />

      <RecentlyViewedSection />

      <Animated.View entering={FadeInDown.delay(350).duration(400)} style={styles.feedIntro}>
        <AppSectionHeader
          title="Nouvelles annonces"
          subtitle="Actualisées en continu, triées par défaut"
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
  },
  stickySearchWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    zIndex: 20,
    paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(15, 23, 42, 0.06)',
  },
  stickySearchBar: {
    marginTop: 2,
    marginBottom: 0,
  },
  headerRoot: {
    paddingTop: 10,
    marginTop: 0,
    paddingBottom: ui.spacing.lg,
  },
  headerRootCompact: {
    paddingTop: 8,
    paddingBottom: ui.spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingTop: 0,
    paddingBottom: 4,
    marginTop: 0,
    width: '100%',
  },
  messagesHit: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: ui.radius.pill,
    backgroundColor: ui.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: ui.colors.borderLight,
  },
  messagesHitPressed: {
    opacity: 0.9,
    backgroundColor: ui.colors.primarySoft,
  },
  messagesIconSlot: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messagesBadge: {
    position: 'absolute',
    top: -6,
    right: -8,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: ui.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messagesBadgeText: {
    color: ui.colors.surface,
    fontSize: 10,
    fontWeight: '700',
  },
  hero: {
    alignItems: 'center',
    marginTop: 0,
    paddingHorizontal: ui.spacing.md,
  },
  logoWrapper: {
    backgroundColor: 'rgba(220, 252, 231, 0.45)',
    padding: ui.spacing.sm,
    borderRadius: ui.radius.pill,
    borderWidth: 1,
    borderColor: ui.colors.borderLight,
  },
  brandName: {
    ...ui.typography.h2,
    color: ui.colors.primary,
    letterSpacing: -0.25,
    marginTop: 8,
  },
  tagline: {
    ...ui.typography.caption,
    marginTop: 4,
    textAlign: 'center',
  },
  searchBarSpacing: {
    marginTop: 8,
  },
  sellCtaLayout: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: ui.spacing.md,
    paddingHorizontal: ui.spacing.lg,
    marginBottom: ui.spacing.lg,
    marginTop: -ui.spacing.xs,
  },
  sellCtaCompact: {
    paddingVertical: ui.spacing.sm,
    paddingHorizontal: ui.spacing.sm,
    marginBottom: ui.spacing.md,
  },
  sellCtaPressed: {
    opacity: 0.94,
    backgroundColor: ui.colors.primarySoft,
  },
  sellCtaTextBlock: {
    flex: 1,
    marginRight: ui.spacing.sm,
  },
  sellCtaTitle: {
    ...ui.typography.bodySmall,
    fontWeight: '600',
    color: ui.colors.textPrimary,
  },
  sellCtaSubtitle: {
    ...ui.typography.caption,
    marginTop: ui.spacing.xs,
  },
  feedIntro: {
    marginTop: ui.spacing.xl,
    marginBottom: ui.spacing.md,
  },
});
