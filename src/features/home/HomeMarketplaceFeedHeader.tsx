/**
 * Bloc commun du fil d’accueil marketplace (Boosté, catégories optionnelles, CTA vente, intro feed).
 * Réutilisé par l’onglet Chercher (accueil) et peut servir l’ancienne route Home si besoin.
 */

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  AppSectionHeader,
  appMarketplaceSurface,
  HomeCategoryStrip,
} from '@/components';
import {
  BoostedSection,
  ForYouSection,
  NearYouSection,
  UrgentSection,
  RecentlyViewedSection,
} from '@/features/listings';
import { spacing, ui } from '@/theme';
import type { WindowSizeBucket } from '@/lib/responsiveLayout';
import { getSession, onAuthStateChange } from '@/services/auth';

/** Sections connectées — aligné Home historique (désactivées pour egress). */
const HOME_ENABLE_CONNECTED_LISTING_SECTIONS = false;

export type AuthState = 'loading' | 'guest' | 'user';

export function useAuthStateForHome(): AuthState {
  const [authState, setAuthState] = useState<AuthState>('loading');
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    getSession()
      .then((session) => {
        if (!mounted.current) return;
        setAuthState(session?.user ? 'user' : 'guest');
      })
      .catch(() => {
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

export type HomeMarketplaceFeedHeaderProps = {
  authState: AuthState;
  bucket: WindowSizeBucket;
  onBoostedVoirTout: () => void;
  onCategoryPress: (id: string, label: string) => void;
  onCategoriesVoirTout: () => void;
  onSellPress: () => void;
  /** Si false, les catégories rapides sont rendues ailleurs (ex. sous la barre de recherche). */
  showCategoryStrip?: boolean;
  /** Si false, masque le CTA « Vendez facilement » (ex. onglet Chercher — route Vendre inchangée). */
  showSellCta?: boolean;
};

export function HomeMarketplaceFeedHeader({
  authState,
  bucket,
  onBoostedVoirTout,
  onCategoryPress,
  onCategoriesVoirTout,
  onSellPress,
  showCategoryStrip = true,
  showSellCta = true,
}: HomeMarketplaceFeedHeaderProps) {
  return (
    <View style={styles.headerRoot}>
      <BoostedSection onVoirToutPress={onBoostedVoirTout} />

      {showCategoryStrip ? (
        <HomeCategoryStrip
          bucket={bucket}
          onCategoryPress={onCategoryPress}
          onAutresPress={onCategoriesVoirTout}
        />
      ) : null}

      {showSellCta ? (
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
            <Ionicons name="chevron-forward" size={17} color={ui.colors.primary} style={styles.sellCtaChevron} />
          </Pressable>
        </View>
      ) : null}

      {authState === 'user' && HOME_ENABLE_CONNECTED_LISTING_SECTIONS ? (
        <View style={styles.connectedSections}>
          <ForYouSection />
          <NearYouSection userCity={null} />
          <UrgentSection />
          <RecentlyViewedSection />
        </View>
      ) : null}

      <View style={styles.feedIntro}>
        <AppSectionHeader dense title="Nouvelles annonces" subtitle="Actualisées en continu" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRoot: {
    paddingTop: 2,
  },
  connectedSections: {
    marginTop: 4,
  },
  sellCtaWrap: {
    paddingHorizontal: 16,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  sellCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: ui.spacing.lg,
    borderRadius: 19,
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
      },
      android: { elevation: 2 },
      default: {},
    }),
  },
  sellCtaChevron: {
    marginLeft: 2,
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
    marginTop: ui.spacing.xs,
    marginBottom: ui.spacing.xs,
    paddingHorizontal: 16,
  },
});
