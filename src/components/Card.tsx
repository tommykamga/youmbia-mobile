/**
 * Card – container with border, radius, optional shadow.
 * Web: ListingCard (rounded-2xl border bg-white shadow-sm), cardStyles.default | elevated | subtle.
 */

import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { cardStyles } from '@/theme';

type CardVariant = 'default' | 'elevated' | 'subtle';

type CardProps = {
  children: React.ReactNode;
  variant?: CardVariant;
  style?: ViewStyle;
};

const variantStyles: Record<CardVariant, ViewStyle> = {
  default: { ...cardStyles.default },
  elevated: { ...cardStyles.elevated },
  subtle: { ...cardStyles.subtle },
};

export function Card({ children, variant = 'default', style }: CardProps) {
  return <View style={[variantStyles[variant], styles.base, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  base: {
    overflow: 'hidden',
  },
});
