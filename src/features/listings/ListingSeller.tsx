/**
 * ListingSeller – seller card with name, "Actif depuis", and trust badges.
 * Uses cardStyles.default. Optional onPress for navigation to public profile (Sprint 5.2).
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { colors, spacing, typography, fontWeights, cardStyles } from '@/theme';
import { formatJoinDate } from '@/lib/format';
import { SellerBadge } from './SellerBadge';
import type { ListingDetail } from '@/services/listings';

type ListingSellerProps = {
  listing: ListingDetail;
  /** When provided, the card is pressable and navigates to public seller profile. */
  onPress?: () => void;
};

const TRUST_SCORE_HIGH_THRESHOLD = 70;

export function ListingSeller({ listing, onPress }: ListingSellerProps) {
  const seller = listing.seller;
  const name = seller?.full_name?.trim() || 'Vendeur';
  const joinDate = formatJoinDate(seller?.created_at ?? null);
  const isVerified = seller?.is_verified === true;
  const isFlagged = seller?.is_flagged === true || (Number(seller?.reports_count ?? 0) > 0);
  const trustScore = seller?.trust_score;
  const isReliable = !isFlagged && trustScore != null && trustScore >= TRUST_SCORE_HIGH_THRESHOLD;
  const hasAnyBadge = isVerified || isReliable || isFlagged;
  const isBanned = seller?.is_banned === true;
  const showTrustScore = trustScore != null;

  const content = (
    <>
      <Text style={styles.name}>{name}</Text>
      {joinDate ? (
        <Text style={styles.meta}>Actif depuis {joinDate}</Text>
      ) : null}
      {isBanned && (
        <Text style={styles.restrictedNotice}>Ce vendeur ne peut pas être contacté.</Text>
      )}
      {showTrustScore && (
        <Text style={styles.trustScoreText}>Score confiance : {trustScore}</Text>
      )}
      {hasAnyBadge && (
        <View style={styles.badges}>
          {isVerified && (
            <SellerBadge variant="verified" label="✔ Vendeur vérifié" />
          )}
          {isReliable && (
            <SellerBadge variant="reliable" label="⭐ Profil fiable" />
          )}
          {isFlagged && (
            <SellerBadge variant="flagged" label="⚠ Vendeur signalé" />
          )}
        </View>
      )}
    </>
  );

  if (onPress && !isBanned) {
    return (
      <Pressable
        style={({ pressed }) => [styles.card, cardStyles.default, pressed && styles.pressed]}
        onPress={onPress}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View style={[styles.card, cardStyles.default]}>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.base,
    marginTop: spacing.lg,
    marginBottom: spacing.xl,
  },
  name: {
    ...typography.base,
    fontWeight: fontWeights.semibold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  meta: {
    ...typography.sm,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  restrictedNotice: {
    ...typography.sm,
    color: colors.textMuted,
    fontStyle: 'italic',
    marginBottom: spacing.xs,
  },
  trustScoreText: {
    ...typography.xs,
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  pressed: {
    opacity: 0.9,
  },
});
