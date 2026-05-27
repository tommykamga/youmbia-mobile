/**
 * Carte boutique — rail horizontal accueil (premium, sobre).
 */

import React, { memo, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Image, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ProSellerBadge } from './ProSellerBadge';
import { getShopInitials } from '@/lib/shopSeller';
import type { PopularShop } from '@/services/shops/getPopularShops';
import { colors, spacing, typography, fontWeights, radius, cardStyles } from '@/theme';

export const SHOP_CARD_RAIL_WIDTH = 248;
export const SHOP_CARD_RAIL_MARGIN_END = 12;
export const SHOP_CARD_RAIL_STRIDE = SHOP_CARD_RAIL_WIDTH + SHOP_CARD_RAIL_MARGIN_END;

type ShopCardProps = {
  shop: PopularShop;
  variant?: 'default' | 'compact';
};

function ShopCardInner({ shop, variant = 'default' }: ShopCardProps) {
  const router = useRouter();
  const initials = getShopInitials(shop.name);
  const isCompact = variant === 'compact';
  const [logoFailed, setLogoFailed] = useState(false);
  const listingsLabel =
    shop.active_listings_count > 0
      ? `${shop.active_listings_count} annonce${shop.active_listings_count > 1 ? 's' : ''}`
      : 'Boutique pro';

  const onPress = () => {
    if (!shop.slug?.trim()) return;
    router.push(`/shop/${shop.slug.trim()}`);
  };

  useEffect(() => {
    setLogoFailed(false);
  }, [shop.logo_url]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Voir la boutique ${shop.name}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        isCompact && styles.cardCompact,
        { width: isCompact ? 168 : SHOP_CARD_RAIL_WIDTH },
        pressed && styles.cardPressed,
      ]}
    >
      <View style={[styles.banner, isCompact && styles.bannerCompact]}>
        {shop.banner_url ? (
          <Image source={{ uri: shop.banner_url }} style={styles.bannerImage} resizeMode="cover" />
        ) : (
          <View style={styles.bannerFallback} />
        )}
        <View style={styles.bannerOverlay} />
      </View>

      <View style={[styles.body, isCompact && styles.bodyCompact]}>
        <View style={styles.logoRow}>
          {shop.logo_url && !logoFailed ? (
            <Image
              source={{ uri: shop.logo_url }}
              style={[styles.logo, isCompact && styles.logoCompact]}
              onError={() => setLogoFailed(true)}
            />
          ) : (
            <View style={[styles.logoFallback, isCompact && styles.logoCompact]}>
              <Text style={[styles.logoInitials, isCompact && styles.logoInitialsCompact]}>{initials}</Text>
            </View>
          )}
          {!isCompact ? (
            <Pressable
              onPress={onPress}
              hitSlop={8}
              style={({ pressed }) => [styles.voirBtn, pressed && styles.voirBtnPressed]}
            >
              <Text style={styles.voirBtnText}>Voir</Text>
              <Ionicons name="chevron-forward" size={12} color={colors.primary} />
            </Pressable>
          ) : null}
        </View>

        <Text style={[styles.name, isCompact && styles.nameCompact]} numberOfLines={2}>
          {shop.name}
        </Text>

        <View style={styles.badgesWrap}>
          <ProSellerBadge sellerType="pro" shop={shop} compact />
        </View>

        {shop.city?.trim() ? (
          <View style={styles.metaRow}>
            <Ionicons name="location-outline" size={12} color={colors.textMuted} />
            <Text style={styles.metaText} numberOfLines={1}>
              {shop.city.trim()}
            </Text>
          </View>
        ) : null}

        {!isCompact ? (
          <Text style={styles.listingsCount} numberOfLines={1}>
            {listingsLabel}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export const ShopCard = memo(ShopCardInner);

const styles = StyleSheet.create({
  card: {
    ...cardStyles.default,
    overflow: 'hidden',
    padding: 0,
    marginRight: SHOP_CARD_RAIL_MARGIN_END,
    borderRadius: radius.lg,
    borderColor: colors.borderLight,
    ...Platform.select({
      ios: {
        shadowOpacity: 0.04,
        shadowRadius: 5,
      },
      android: { elevation: 1 },
      default: {},
    }),
  },
  cardCompact: {
    marginRight: spacing.sm,
    borderRadius: radius.lg,
  },
  cardPressed: {
    opacity: 0.94,
  },
  banner: {
    height: 44,
    backgroundColor: colors.surfaceSubtle,
    overflow: 'hidden',
  },
  bannerCompact: {
    height: 40,
  },
  bannerImage: {
    width: '100%',
    height: '100%',
  },
  bannerFallback: {
    flex: 1,
    backgroundColor: 'rgba(22, 163, 74, 0.07)',
  },
  bannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.035)',
  },
  body: {
    paddingHorizontal: spacing.sm,
    paddingTop: 6,
    paddingBottom: 6,
    gap: 2,
  },
  bodyCompact: {
    paddingBottom: 4,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: -14,
  },
  logo: {
    width: 38,
    height: 38,
    borderRadius: radius.md + 2,
    borderWidth: 2,
    borderColor: colors.surface,
    backgroundColor: colors.surface,
  },
  logoCompact: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    marginTop: -14,
  },
  logoFallback: {
    width: 38,
    height: 38,
    borderRadius: radius.md + 2,
    borderWidth: 2,
    borderColor: colors.surface,
    backgroundColor: 'rgba(22, 163, 74, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoInitials: {
    ...typography.sm,
    fontWeight: fontWeights.bold,
    color: colors.primary,
  },
  logoInitialsCompact: {
    ...typography.xs,
  },
  name: {
    ...typography.sm,
    fontWeight: fontWeights.bold,
    color: colors.text,
    lineHeight: 18,
  },
  nameCompact: {
    ...typography.sm,
    lineHeight: 17,
  },
  badgesWrap: {
    marginTop: 1,
    marginBottom: 0,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 0,
  },
  metaText: {
    flex: 1,
    ...typography.xs,
    color: colors.textMuted,
  },
  listingsCount: {
    ...typography.xs,
    lineHeight: 14,
    color: colors.textSecondary,
    fontWeight: fontWeights.medium,
    marginTop: 0,
  },
  voirBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 1,
    paddingVertical: 3,
    paddingHorizontal: 9,
    borderRadius: radius.full,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    marginTop: 0,
  },
  voirBtnPressed: {
    opacity: 0.85,
  },
  voirBtnText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: fontWeights.semibold,
    color: colors.primary,
  },
});
