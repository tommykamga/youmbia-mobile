/**
 * Home YOUMBIA — marketplace premium : header brandé, recherche, à la une,
 * catégories compactes, CTA vente, aperçu annonces (limite + « Voir plus »).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Screen,
  AppSearchBar,
  AppSectionHeader,
  appMarketplaceSurface,
  HomeBrandHeader,
  HomeCategoryStrip,
} from '@/components';
import {
  ListingFeed,
  BoostedSection,
  NearYouSection,
  UrgentSection,
  ForYouSection,
  RecentlyViewedSection,
} from '@/features/listings';
import { spacing, ui, colors } from '@/theme';
import {
  useResponsiveLayout,
  getHomeSearchPlaceholder,
  type WindowSizeBucket,
} from '@/lib/responsiveLayout';
import { getSession, onAuthStateChange } from '@/services/auth';
import { buildAuthGateHref } from '@/lib/authGateNavigation';
import { useUnreadMessagesCount } from '@/hooks/useUnreadMessagesCount';

type AuthState = 'loading' | 'guest' | 'user';

function useAuthState(): AuthState {
  const [authState, setAuthState] = useState<AuthState>('loading');
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    getSession().then((session) => {
      if (!mounted.current) return;
      setAuthState(session?.user ? 'user' : 'guest');
    }).catch(() => {
      if (mounted.current) setAuthState('guest');
    });

    const unsub = onAuthStateChange((_event, session) => {
      if (!mounted.current) return;
      setAuthState(session?.user ? 'user' : 'guest');
    });

    return () => {
      mounted.current = false;
      unsub();
    };
  }, []);

  return authState;
}

type HomeHeaderProps = {
  authState: AuthState;
  bucket: WindowSizeBucket;
  onBoostedVoirTout: () => void;
  onCategoryPress: (id: string, label: string) => void;
  onCategoriesVoirTout: () => void;
  onSellPress: () => void;
};

function HomeHeader({
  authState,
  bucket,
  onBoostedVoirTout,
  onCategoryPress,
  onCategoriesVoirTout,
  onSellPress,
}: HomeHeaderProps) {
  return (
    <View style={styles.headerRoot}>
      <BoostedSection onVoirToutPress={onBoostedVoirTout} />

      <HomeCategoryStrip
        bucket={bucket}
        onCategoryPress={onCategoryPress}
        onAutresPress={onCategoriesVoirTout}
      />

      <View style={styles.sellCtaWrap}>
        <Pressable
          style={({ pressed }) => [
            appMarketplaceSurface,
            styles.sellCta,
            pressed && styles.sellCtaPressed,
          ]}
          onPress={onSellPress}
          accessibilityRole="button"
          accessibilityLabel="Vendez facilement sur YOUMBIA"
        >
          <View style={styles.sellCtaText}>
            <Text style={styles.sellCtaTitle} numberOfLines={1}>
              Vendez facilement
            </Text>
            <Text style={styles.sellCtaSubtitle} numberOfLines={1}>
              Publiez votre annonce en quelques secondes
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={ui.colors.primary} />
        </Pressable>
      </View>

      {authState === 'user' && (
        <View style={styles.connectedSections}>
          <ForYouSection />
          <NearYouSection userCity={null} />
          <UrgentSection />
          <RecentlyViewedSection />
        </View>
      )}

      <View style={styles.feedIntro}>
        <AppSectionHeader title="Nouvelles annonces" subtitle="Actualisées en continu" />
      </View>
    </View>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { bucket } = useResponsiveLayout();
  const compact = bucket === 'compact';
  const searchPlaceholder = getHomeSearchPlaceholder(bucket);
  const unreadCount = useUnreadMessagesCount();
  const authState = useAuthState();

  const handleSearchPress = useCallback(() => {
    router.push('/(tabs)/search');
  }, [router]);

  const handleBoostedVoirTout = useCallback(() => {
    router.push('/(tabs)/search');
  }, [router]);

  const handleCategoryPress = useCallback((id: string, label: string) => {
    router.push({
      pathname: '/(tabs)/search',
      params: { categoryId: id, categoryLabel: label },
    } as any);
  }, [router]);

  const handleCategoriesVoirTout = useCallback(() => {
    router.push('/categories');
  }, [router]);

  const handleSellPress = useCallback(async () => {
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

  const headerComponent = (
    <HomeHeader
      authState={authState}
      bucket={bucket}
      onBoostedVoirTout={handleBoostedVoirTout}
      onCategoryPress={handleCategoryPress}
      onCategoriesVoirTout={handleCategoriesVoirTout}
      onSellPress={handleSellPress}
    />
  );

  return (
    <Screen noPadding safe={false}>
      <SafeAreaView style={styles.safeTop} edges={['top', 'left', 'right']}>
        <View style={[styles.homeColumn, { paddingBottom: insets.bottom }]}>
          <View style={styles.topStack}>
            <HomeBrandHeader onMessagesPress={handleMessagesPress} unreadCount={unreadCount} />
            <View style={styles.searchStrip}>
              <AppSearchBar
                placeholder={searchPlaceholder}
                onPress={handleSearchPress}
                compact={compact}
                style={styles.searchBarHome}
              />
            </View>
          </View>

          <View style={styles.homeFeedSlot}>
            <ListingFeed
              listHeaderComponent={headerComponent}
              limit={20}
              footerAction={{
                label: 'Voir plus d\'annonces',
                onPress: () => router.push('/(tabs)/search?from=home'),
              }}
              contentPaddingHorizontal={0}
              listingCardFeedPresentation="home"
            />
          </View>
        </View>
      </SafeAreaView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  safeTop: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  homeColumn: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  topStack: {
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: ui.colors.borderLight,
  },
  homeFeedSlot: {
    flex: 1,
  },
  /** Marges uniquement : une seule surface = `AppSearchBar` (fond, radius, bordure, ombre). */
  searchStrip: {
    paddingHorizontal: 12,
    paddingTop: 2,
    paddingBottom: 12,
  },
  searchBarHome: {
    marginTop: 0,
    marginBottom: 0,
    backgroundColor: colors.surface,
  },
  headerRoot: {
    paddingTop: 4,
  },
  connectedSections: {
    marginTop: 4,
  },
  sellCtaWrap: {
    paddingHorizontal: 16,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  sellCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: ui.spacing.md,
    paddingHorizontal: ui.spacing.lg,
    borderRadius: ui.radius.lg,
  },
  sellCtaPressed: {
    opacity: 0.94,
    backgroundColor: ui.colors.primarySoft,
  },
  sellCtaText: {
    flex: 1,
    marginRight: ui.spacing.sm,
  },
  sellCtaTitle: {
    ...ui.typography.bodySmall,
    fontWeight: '700',
    color: ui.colors.textPrimary,
  },
  sellCtaSubtitle: {
    ...ui.typography.caption,
    marginTop: ui.spacing.xs,
  },
  feedIntro: {
    marginTop: ui.spacing.sm,
    marginBottom: ui.spacing.sm,
    paddingHorizontal: 16,
  },
});
