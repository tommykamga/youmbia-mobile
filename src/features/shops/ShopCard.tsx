/**
 * Carte boutique — rail horizontal accueil (premium, sobre).
 */

import React, { memo } from 'react';
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
  const listingsLabel =
    shop.active_listings_count > 0
      ? `${shop.active_listings_count} annonce${shop.active_listings_count > 1 ? 's' : ''}`
      : 'Boutique pro';

  const onPress = () => {
    if (!shop.slug?.trim()) return;
    router.push(`/shop/${shop.slug.trim()}`);
  };

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
          {shop.logo_url ? (
            <Image source={{ uri: shop.logo_url }} style={[styles.logo, isCompact && styles.logoCompact]} />
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
              <Ionicons name="chevron-forward" size={14} color={colors.primary} />
            </Pressable>
          ) : null}
        </View>

        <Text style={[styles.name, isCompact && styles.nameCompact]} numberOfLines={2}>
          {shop.name}
        </Text>

        <ProSellerBadge sellerType="pro" shop={shop} compact />

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
    borderRadius: radius.xl,
  },
  cardCompact: {
    marginRight: spacing.sm,
    borderRadius: radius.lg,
  },
  cardPressed: {
    opacity: 0.94,
  },
  banner: {
    height: 72,
    backgroundColor: colors.surfaceSubtle,
    overflow: 'hidden',
  },
  bannerCompact: {
    height: 56,
  },
  bannerImage: {
    width: '100%',
    height: '100%',
  },
  bannerFallback: {
    flex: 1,
    backgroundColor: 'rgba(22, 163, 74, 0.1)',
  },
  bannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.05)',
  },
  body: {
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    paddingBottom: spacing.base,
    gap: 4,
  },
  bodyCompact: {
    paddingBottom: spacing.sm,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: -22,
  },
  logo: {
    width: 44,
    height: 44,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.surface,
    backgroundColor: colors.surface,
  },
  logoCompact: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    marginTop: -18,
  },
  logoFallback: {
    width: 44,
    height: 44,
    borderRadius: radius.lg,
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
    ...typography.base,
    fontWeight: fontWeights.bold,
    color: colors.text,
    marginTop: 2,
  },
  nameCompact: {
    ...typography.sm,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  metaText: {
    flex: 1,
    ...typography.xs,
    color: colors.textMuted,
  },
  listingsCount: {
    ...typography.xs,
    color: colors.textSecondary,
    fontWeight: fontWeights.medium,
    marginTop: 2,
  },
  voirBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingVertical: 4,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 3,
      },
      android: { elevation: 1 },
      default: {},
    }),
  },
  voirBtnPressed: {
    opacity: 0.85,
  },
  voirBtnText: {
    ...typography.xs,
    fontWeight: fontWeights.semibold,
    color: colors.primary,
  },
});
