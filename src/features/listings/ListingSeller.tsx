/**
 * ListingSeller – seller card with name, "Actif depuis", and trust badges.
 * Uses cardStyles.default. Optional onPress for navigation to public profile (Sprint 5.2).
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Button } from '@/components';
import { colors, spacing, typography, fontWeights, radius, shadows } from '@/theme';
import { formatJoinDate } from '@/lib/format';
import { SellerBadge } from './SellerBadge';
import type { ListingDetail } from '@/services/listings';

type ListingSellerProps = {
  listing: ListingDetail;
  memberSince?: string | null;
  listingCount?: number | null;
  /** When provided, a discreet CTA navigates to public seller profile. */
  onPress?: () => void;
};

const TRUST_SCORE_HIGH_THRESHOLD = 70;

export function ListingSeller({ listing, memberSince, listingCount, onPress }: ListingSellerProps) {
  const seller = listing.seller;
  const name = seller?.full_name?.trim() || 'Vendeur';
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

  const avatarInitial = name.charAt(0).toUpperCase();

  const content = (
    <>
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{avatarInitial}</Text>
        </View>
        <View style={styles.headerInfo}>
          <Text style={styles.name}>{name}</Text>
          {joinDate ? (
            <Text style={styles.joinDate}>Membre depuis {joinDate}</Text>
          ) : null}
        </View>
      </View>

      <View style={styles.statsRow}>
        {listingCountLabel && (
          <View style={styles.statItem}>
            <Ionicons name="list" size={16} color={colors.textMuted} />
            <Text style={styles.statValue}>{listingCountLabel}</Text>
          </View>
        )}
        {isReliable && (
          <View style={styles.statItem}>
            <Ionicons name="star" size={16} color={colors.warning} />
            <Text style={styles.statValue}>Profil fiable</Text>
          </View>
        )}
      </View>

      {isBanned && (
        <Text style={styles.restrictedNotice}>Ce vendeur ne peut pas être contacté.</Text>
      )}

      {seller?.response_hint?.trim() && (
        <View style={styles.hintContainer}>
          <Ionicons name="time-outline" size={14} color={colors.success} />
          <Text style={styles.responseHint}>{seller.response_hint.trim()}</Text>
        </View>
      )}

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
    <View style={styles.card}>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    padding: spacing.base,
    borderRadius: radius.xl,
    marginTop: spacing.lg,
    marginBottom: spacing.xl,
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...shadows.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.base,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  avatarText: {
    ...typography.lg,
    fontWeight: fontWeights.bold,
    color: colors.primary,
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
  joinDate: {
    ...typography.xs,
    color: colors.textMuted,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    marginBottom: spacing.base,
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
    marginBottom: spacing.base,
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
    marginBottom: spacing.base,
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.base,
  },
  ctaButton: {
    alignSelf: 'stretch',
    borderRadius: radius.full,
  },
});
