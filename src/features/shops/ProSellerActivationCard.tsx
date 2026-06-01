/**
 * CTA activation vendeur pro — Compte / Mes annonces.
 */

import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Button } from '@/components';
import { shareShop } from '@/lib/shareShop';
import { getMySellerProStatus } from '@/services/shops';
import { colors, spacing, typography, fontWeights, radius } from '@/theme';

type Props = {
  variant?: 'account' | 'listings';
};

export function ProSellerActivationCard({ variant = 'account' }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [hasShop, setHasShop] = useState(false);
  const [shopSlug, setShopSlug] = useState<string | null>(null);
  const [shopName, setShopName] = useState<string | null>(null);
  const [isVerified, setIsVerified] = useState(false);
  const [shopCity, setShopCity] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getMySellerProStatus();
      if (result.error || !result.data) {
        setHasShop(false);
        return;
      }
      const shop = result.data.shop;
      setHasShop(!!shop);
      setShopSlug(shop?.slug ?? null);
      setShopName(shop?.name ?? null);
      setShopCity(shop?.city ?? null);
      setIsVerified(shop?.is_verified === true);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const handleShare = useCallback(async () => {
    if (!shopSlug || !shopName || sharing) return;
    setSharing(true);
    try {
      await shareShop({ slug: shopSlug, name: shopName, city: shopCity });
    } finally {
      setSharing(false);
    }
  }, [shopCity, shopName, shopSlug, sharing]);

  if (loading) {
    return null;
  }

  if (hasShop && shopSlug) {
    return (
      <View style={[styles.card, variant === 'listings' && styles.cardListings]}>
        <View style={styles.iconWrap}>
          <Ionicons name="storefront" size={22} color={colors.primary} />
        </View>
        <View style={styles.textSlot}>
          <Text style={styles.title}>{shopName ?? 'Ma boutique'}</Text>
          <Text style={styles.subtitle}>
            {isVerified
              ? 'Boutique vérifiée — partagez votre lien pour attirer vos clients.'
              : 'Partagez votre boutique avec vos clients et publiez vos produits en quelques secondes.'}
          </Text>
        </View>
        <View style={styles.shopActions}>
          <Button
            size="sm"
            variant="outline"
            onPress={() => router.push(`/shop/${shopSlug}`)}
            style={styles.ctaBtn}
          >
            Voir la boutique
          </Button>
          <Button
            size="sm"
            onPress={() => void handleShare()}
            loading={sharing}
            disabled={sharing}
            leftIcon={<Ionicons name="share-outline" size={16} color={colors.surface} />}
            style={styles.ctaBtn}
          >
            Partager
          </Button>
        </View>
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Créer ma boutique professionnelle"
      onPress={() => router.push('/account/pro-shop')}
      style={({ pressed }) => [
        styles.promoWrap,
        variant === 'listings' && styles.cardListings,
        pressed && styles.cardPressed,
      ]}
    >
      <View style={styles.promoCard}>
        <View style={styles.promoGlow} pointerEvents="none" />

        <View style={styles.promoHeader}>
          <View style={styles.promoIconCircle}>
            <Ionicons name="storefront" size={20} color={colors.primary} />
          </View>
          <View style={styles.proBadge}>
            <Text style={styles.proBadgeText}>PRO</Text>
          </View>
        </View>

        <View style={styles.promoBody}>
          <View style={styles.promoTextSlot}>
            <Text style={styles.promoTitle}>
              Créez votre boutique{'\n'}et{' '}
              <Text style={styles.promoTitleAccent}>développez</Text> vos ventes
            </Text>
            <Text style={styles.promoSubtitle} numberOfLines={2}>
              Boutique dédiée, statistiques et visibilité professionnelle.
            </Text>
          </View>
          <StoreIllustration />
        </View>

        <View style={styles.benefitsRow}>
          <View style={styles.benefitItem}>
            <Ionicons name="checkmark-circle" size={15} color={colors.primary} />
            <Text style={styles.benefitText} numberOfLines={1}>Boutique Pro</Text>
          </View>
          <View style={styles.benefitItem}>
            <Ionicons name="checkmark-circle" size={15} color={colors.primary} />
            <Text style={styles.benefitText} numberOfLines={1}>Lien partageable</Text>
          </View>
        </View>

        <View style={styles.ctaBtnPromo}>
          <Text style={styles.ctaBtnPromoText}>Créer ma boutique</Text>
        </View>
      </View>
    </Pressable>
  );
}

/** Illustration boutique décorative 100% React Native (sans asset externe). */
function StoreIllustration() {
  return (
    <View style={styles.illu} pointerEvents="none">
      <LinearGradient
        colors={['#22C55E', '#15803D']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.illuBody}
      >
        <View style={styles.illuAwning}>
          {[0, 1, 2, 3].map((i) => (
            <View
              key={i}
              style={[
                styles.illuStripe,
                i % 2 === 0 ? styles.illuStripeLight : styles.illuStripeDark,
              ]}
            />
          ))}
        </View>
        <View style={styles.illuWindow} />
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.base,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    padding: spacing.base,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.surface,
    gap: spacing.sm,
    maxWidth: 760,
    width: '100%',
    alignSelf: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 6,
      },
      android: { elevation: 1 },
      default: {},
    }),
  },
  cardListings: {
    marginHorizontal: 0,
    marginTop: 0,
  },
  cardPressed: {
    opacity: 0.96,
    transform: [{ scale: 0.995 }],
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textSlot: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  title: {
    ...typography.base,
    fontWeight: fontWeights.bold,
    color: colors.text,
  },
  subtitle: {
    ...typography.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  shopActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  ctaBtn: {
    alignSelf: 'flex-start',
  },

  // ─── Carte promo premium (création boutique) — compacte ───────────────────
  promoWrap: {
    marginHorizontal: spacing.base,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    borderRadius: 28,
    maxWidth: 760,
    width: '100%',
    alignSelf: 'center',
    backgroundColor: colors.surface,
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.08,
        shadowRadius: 14,
      },
      android: { elevation: 2 },
      default: {},
    }),
  },
  promoCard: {
    borderRadius: 28,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.base,
    borderWidth: 1,
    borderColor: '#EEF2F6',
    backgroundColor: colors.surface,
    overflow: 'hidden',
    gap: spacing.md,
  },
  promoGlow: {
    position: 'absolute',
    top: -70,
    right: -70,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(34,197,94,0.04)',
  },
  promoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  promoIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#ECFDF3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  proBadge: {
    height: 24,
    paddingHorizontal: 10,
    borderRadius: radius.full,
    backgroundColor: '#ECFDF3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  proBadgeText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: fontWeights.black,
    letterSpacing: 0.6,
  },
  promoBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  promoTextSlot: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    gap: 4,
  },
  promoTitle: {
    fontSize: 19,
    lineHeight: 24,
    fontWeight: fontWeights.black,
    color: '#0F172A',
    letterSpacing: -0.4,
  },
  promoTitleAccent: {
    color: colors.primary,
  },
  promoSubtitle: {
    ...typography.sm,
    color: '#64748B',
    lineHeight: 18,
  },
  benefitsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.base,
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flexShrink: 1,
  },
  benefitText: {
    ...typography.xs,
    fontSize: 13,
    color: '#0F172A',
    fontWeight: fontWeights.semibold,
    flexShrink: 1,
  },
  ctaBtnPromo: {
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaBtnPromoText: {
    color: '#FFFFFF',
    ...typography.sm,
    fontWeight: fontWeights.bold,
    letterSpacing: 0.1,
  },

  // ─── Illustration boutique décorative (Views) — réduite ───────────────────
  illu: {
    width: 54,
    height: 54,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.9,
  },
  illuBody: {
    width: 46,
    height: 46,
    borderRadius: 14,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.22,
        shadowRadius: 8,
      },
      android: { elevation: 3 },
      default: {},
    }),
  },
  illuAwning: {
    flexDirection: 'row',
    height: 11,
    width: '100%',
  },
  illuStripe: {
    flex: 1,
    height: '100%',
  },
  illuStripeLight: {
    backgroundColor: '#FFFFFF',
  },
  illuStripeDark: {
    backgroundColor: '#BBF7D0',
  },
  illuWindow: {
    position: 'absolute',
    bottom: 8,
    alignSelf: 'center',
    width: 20,
    height: 18,
    borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
});
