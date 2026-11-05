/**
 * ListingSeller – seller card with name, "Actif depuis", and trust badges.
 * Uses cardStyles.default. Optional onPress for navigation to public profile (Sprint 5.2).
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Button, UserAvatar } from '@/components';
import { colors, spacing, typography, fontWeights, radius } from '@/theme';
import { formatJoinDate } from '@/lib/format';
import { getUserDisplayName } from '@/services/profile';
import { isShopPubliclyActive, shouldShowProSellerBadge, shouldShowVerifiedShopBadge } from '@/lib/shopSeller';
import { SellerBadge } from './SellerBadge';
import { ProSellerBadge } from '@/features/shops/ProSellerBadge';
import type { ListingDetail } from '@/services/listings';

type ListingSellerProps = {
  listing: ListingDetail;
  memberSince?: string | null;
  listingCount?: number | null;
  /** When provided, a discreet CTA navigates to public seller profile. */
  onPress?: () => void;
  /** Boutique publique déjà chargée sur l’annonce. */
  onShopPress?: () => void;
};

const TRUST_SCORE_HIGH_THRESHOLD = 70;

export function ListingSeller({ listing, memberSince, listingCount, onPress, onShopPress }: ListingSellerProps) {
  const seller = listing.seller;
  const name = getUserDisplayName({ full_name: seller?.full_name }, 'Vendeur');
  const shop = listing.shop;
  const shopName = shop?.name?.trim() ?? '';
  const showShop = Boolean(shopName && shop?.slug && isShopPubliclyActive(shop) && onShopPress);
  const headline = showShop ? shopName : name;
  const personLine = showShop && name && name !== shopName ? name : null;
  const joinDate = formatJoinDate(memberSince ?? seller?.created_at ?? null);
  const isVerified = seller?.is_verified === true;
  const isPhoneVerified = seller?.phone_verified === true;
  const isFlagged = seller?.is_flagged === true || (Number(seller?.reports_count ?? 0) > 0);
  const trustScore = seller?.trust_score;
  const isReliable = !isFlagged && trustScore != null && trustScore >= TRUST_SCORE_HIGH_THRESHOLD;
  const hasAnyBadge = isVerified || isPhoneVerified || isReliable || isFlagged;
  const isBanned = seller?.is_banned === true;
  const safeListingCount =
    typeof listingCount === 'number' && Number.isFinite(listingCount)
      ? Math.max(0, Math.floor(listingCount))
      : null;
  const listingCountLabel =
    safeListingCount == null ? null : `${safeListingCount} annonce${safeListingCount > 1 ? 's' : ''}`;

  const showProSellerBadge = shouldShowProSellerBadge({
    listingShopId: listing.shop_id,
    sellerType: listing.seller_type,
  });
  const showVerifiedShopBadge =
    shouldShowVerifiedShopBadge(listing.shop) && isShopPubliclyActive(listing.shop);
  const hasProBadgeRow = showProSellerBadge || showVerifiedShopBadge;
  const hasStatsRow = Boolean(listingCountLabel || isReliable);
  const hasExtendedPresentation =
    Boolean(personLine) ||
    Boolean(joinDate) ||
    hasStatsRow ||
    isBanned ||
    Boolean(seller?.response_hint?.trim()) ||
    hasAnyBadge ||
    showShop ||
    hasProBadgeRow;
  const isCompactPresentation = !hasExtendedPresentation;
  const avatarSize = isCompactPresentation ? 40 : 48;

  const content = (
    <>
      <View style={[styles.header, isCompactPresentation && styles.headerCompact]}>
        <UserAvatar
          name={headline}
          avatarUrl={seller?.avatar_url}
          avatarVersion={seller?.avatar_version}
          displayUrl={seller?.avatar_display_url}
          size={avatarSize}
          style={styles.avatar}
        />
        <View style={styles.headerInfo}>
          <Text style={styles.name}>{headline}</Text>
          {personLine ? <Text style={styles.personLine}>{personLine}</Text> : null}
          {joinDate ? (
            <Text style={styles.joinDate}>Membre depuis {joinDate}</Text>
          ) : null}
        </View>
      </View>

      {hasStatsRow ? (
        <View style={styles.statsRow}>
          {listingCountLabel ? (
            <View style={styles.statItem}>
              <Ionicons name="list" size={16} color={colors.textMuted} />
              <Text style={styles.statValue}>{listingCountLabel}</Text>
            </View>
          ) : null}
          {isReliable ? (
            <View style={styles.statItem}>
              <Ionicons name="star" size={16} color={colors.warning} />
              <Text style={styles.statValue}>Profil fiable</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {isBanned && (
        <Text style={styles.restrictedNotice}>Ce vendeur ne peut pas être contacté.</Text>
      )}

      {seller?.response_hint?.trim() && (
        /* Shown only when a backend-provided hint exists. TOM-101: not populated — insufficient reliable data. */
        <View style={styles.hintContainer}>
          <Ionicons name="time-outline" size={14} color={colors.success} />
          <Text style={styles.responseHint}>{seller.response_hint.trim()}</Text>
        </View>
      )}

      {hasProBadgeRow ? (
        <View style={styles.proBadgeWrap}>
          <ProSellerBadge
            listingShopId={listing.shop_id}
            sellerType={listing.seller_type}
            shop={listing.shop}
            compact={isCompactPresentation}
          />
        </View>
      ) : null}

      {hasAnyBadge && (
        <View style={styles.badges}>
          {isVerified && (
            <SellerBadge variant="verified" label="✔ Vendeur vérifié" />
          )}
          {isPhoneVerified && (
            <SellerBadge variant="phoneVerified" label="Téléphone vérifié" />
          )}
          {isFlagged && (
            <SellerBadge variant="flagged" label="⚠ Vendeur signalé" />
          )}
        </View>
      )}

      {showShop && onShopPress ? (
        <Pressable
          onPress={onShopPress}
          accessibilityRole="button"
          accessibilityLabel={`Voir la boutique ${shopName}`}
          style={({ pressed }) => [styles.shopLink, pressed && styles.shopLinkPressed]}
        >
          <Ionicons name="storefront-outline" size={18} color={colors.primary} />
          <Text style={styles.shopLinkText}>Voir la boutique</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
        </Pressable>
      ) : null}

      {onPress && !isBanned ? (
        <Button
          variant="secondary"
          size="sm"
          onPress={onPress}
          style={styles.ctaButton}
        >
          Voir ses annonces
        </Button>
      ) : null}
    </>
  );

  return (
    <View style={[styles.card, isCompactPresentation && styles.cardCompact]}>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    padding: spacing.base,
    borderRadius: radius.xl,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  cardCompact: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  headerCompact: {
    marginBottom: 0,
  },
  avatar: {
    marginRight: spacing.md,
  },
  headerInfo: {
    flex: 1,
  },
  name: {
    ...typography.base,
    fontWeight: fontWeights.bold,
    color: colors.text,
    marginBottom: 2,
  },
  personLine: {
    ...typography.sm,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  joinDate: {
    ...typography.xs,
    color: colors.textMuted,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    marginBottom: spacing.sm,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  statValue: {
    ...typography.sm,
    color: colors.textSecondary,
    fontWeight: fontWeights.medium,
  },
  hintContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.successLight + '40',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    marginBottom: spacing.sm,
    alignSelf: 'flex-start',
  },
  responseHint: {
    ...typography.xs,
    color: colors.success,
    fontWeight: fontWeights.medium,
  },
  restrictedNotice: {
    ...typography.sm,
    color: colors.error,
    fontStyle: 'italic',
    marginBottom: spacing.sm,
  },
  proBadgeWrap: {
    marginBottom: spacing.sm,
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  ctaButton: {
    alignSelf: 'stretch',
    borderRadius: radius.full,
    minHeight: 44,
  },
  shopLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 44,
    marginBottom: spacing.sm,
  },
  shopLinkPressed: {
    opacity: 0.75,
  },
  shopLinkText: {
    ...typography.base,
    flex: 1,
    color: colors.primary,
    fontWeight: fontWeights.semibold,
  },
});
