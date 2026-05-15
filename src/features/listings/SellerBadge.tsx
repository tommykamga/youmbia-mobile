/**
 * SellerBadge – single trust signal badge (verified, reliable, flagged).
 * Uses web-aligned badge colors from theme.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, typography, radius } from '@/theme';

export type SellerBadgeVariant =
  | 'verified'
  | 'phoneVerified'
  | 'reliable'
  | 'flagged'
  | 'pro'
  | 'verifiedShop';

const VARIANT_STYLES: Record<
  SellerBadgeVariant,
  { bg: string; text: string }
> = {
  verified: {
    bg: colors.badgeVerifiedBg,
    text: colors.badgeVerifiedText,
  },
  phoneVerified: {
    bg: colors.badgeVerifiedBg,
    text: colors.badgeVerifiedText,
  },
  reliable: {
    bg: colors.badgeNeutralBg,
    text: colors.badgeNeutralText,
  },
  flagged: {
    bg: colors.badgeWarningBg,
    text: colors.badgeWarningText,
  },
  pro: {
    bg: 'rgba(22, 163, 74, 0.12)',
    text: colors.primary,
  },
  verifiedShop: {
    bg: colors.badgeVerifiedBg,
    text: colors.badgeVerifiedText,
  },
};

type SellerBadgeProps = {
  variant: SellerBadgeVariant;
  label: string;
  /** Variante plus compacte (cartes boutique accueil). */
  dense?: boolean;
};

export function SellerBadge({ variant, label, dense = false }: SellerBadgeProps) {
  const style = VARIANT_STYLES[variant];
  return (
    <View style={[styles.badge, dense && styles.badgeDense, { backgroundColor: style.bg }]}>
      <Text
        style={[styles.label, dense && styles.labelDense, { color: style.text }]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    alignSelf: 'flex-start',
  },
  badgeDense: {
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: radius.sm - 1,
  },
  label: {
    ...typography.label.badge,
  },
  labelDense: {
    fontSize: 9,
    lineHeight: 12,
    letterSpacing: 0.35,
  },
});
