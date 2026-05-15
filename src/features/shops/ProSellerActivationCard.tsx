/**
 * CTA activation vendeur pro — Compte / Mes annonces.
 */

import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Button } from '@/components';
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
              ? 'Boutique vérifiée — visible avec le badge Pro sur vos annonces.'
              : 'Boutique active — vos prochaines annonces y seront rattachées.'}
          </Text>
        </View>
        <Button
          size="sm"
          variant="outline"
          onPress={() => router.push(`/shop/${shopSlug}`)}
          style={styles.ctaBtn}
        >
          Voir la boutique
        </Button>
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Créer ma boutique professionnelle"
      onPress={() => router.push('/account/pro-shop')}
      style={({ pressed }) => [
        styles.card,
        styles.cardPromo,
        variant === 'listings' && styles.cardListings,
        pressed && styles.cardPressed,
      ]}
    >
      <View style={styles.promoTop}>
        <View style={[styles.iconWrap, styles.iconWrapPromo]}>
          <Ionicons name="storefront-outline" size={20} color={colors.primary} />
        </View>
        <View style={styles.textSlot}>
          <Text style={styles.title}>Créer ma boutique professionnelle</Text>
          <Text style={styles.subtitle}>
            Boutique dédiée, badge Pro, visibilité renforcée et lien partageable — en quelques minutes.
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
      </View>
      <View style={styles.benefitsRow}>
        {['Boutique', 'Badge Pro', 'Partage'].map((label) => (
          <View key={label} style={styles.benefitChip}>
            <Text style={styles.benefitChipText}>{label}</Text>
          </View>
        ))}
      </View>
    </Pressable>
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
  cardPromo: {
    borderColor: colors.primary + '28',
    backgroundColor: colors.primary + '06',
  },
  cardPressed: {
    opacity: 0.94,
  },
  promoTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapPromo: {
    backgroundColor: colors.primary + '12',
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
  ctaBtn: {
    alignSelf: 'flex-start',
  },
  benefitsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    paddingLeft: 48,
  },
  benefitChip: {
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  benefitChipText: {
    ...typography.xs,
    color: colors.textMuted,
    fontWeight: fontWeights.semibold,
  },
});
