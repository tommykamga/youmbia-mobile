/**
 * SellerBadge – single trust signal badge (verified, reliable, flagged).
 * Uses web-aligned badge colors from theme.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, typography, radius } from '@/theme';

export type SellerBadgeVariant = 'verified' | 'phoneVerified' | 'reliable' | 'flagged';

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
};

type SellerBadgeProps = {
  variant: SellerBadgeVariant;
  label: string;
};

export function SellerBadge({ variant, label }: SellerBadgeProps) {
  const style = VARIANT_STYLES[variant];
  return (
    <View style={[styles.badge, { backgroundColor: style.bg }]}>
      <Text style={[styles.label, { color: style.text }]} numberOfLines={1}>
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
  label: {
    ...typography.label.badge,
  },
});
