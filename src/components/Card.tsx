/**
 * Card – container with border, radius, optional shadow.
 * Web: ListingCard (rounded-2xl border bg-white shadow-sm), cardStyles.default | elevated | subtle.
 */

import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { colors, radius, shadows } from '@/theme';

type CardVariant = 'default' | 'elevated' | 'subtle';

type CardProps = {
  children: React.ReactNode;
  variant?: CardVariant;
  style?: ViewStyle;
};

const variantStyles: Record<CardVariant, ViewStyle> = {
  default: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: radius.xl,
    ...shadows.sm,
  },
  elevated: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius['3xl'],
    ...shadows.soft,
  },
  subtle: {
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: radius.xl,
  },
};

export function Card({ children, variant = 'default', style }: CardProps) {
  return <View style={[variantStyles[variant], styles.base, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  base: {
    overflow: 'hidden',
  },
});
