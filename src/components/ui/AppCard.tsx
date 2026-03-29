/**
 * AppCard — surface « marketplace » (home gate CTA, cartes légères).
 * `Card` existant reste pour elevated/subtle ; celui-ci aligne `ui` + ombre légère.
 */

import React from 'react';
import { View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { shadows, ui } from '@/theme';

const styles = StyleSheet.create({
  marketplace: {
    backgroundColor: ui.colors.surface,
    borderRadius: ui.radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.colors.borderLight,
    ...shadows.sm,
  },
  paddedLg: {
    padding: ui.spacing.lg,
    gap: ui.spacing.md,
  },
});

export type AppCardProps = {
  children: React.ReactNode;
  /** `true` = padding `ui.spacing.lg` + gap entre enfants (équivalent gate). */
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function AppCard({ children, padded = false, style }: AppCardProps) {
  return (
    <View style={[styles.marketplace, padded && styles.paddedLg, style]}>{children}</View>
  );
}

/** Réutilisable sur un `Pressable` quand toute la zone doit être cliquable (ex. CTA home). */
export const appMarketplaceSurface = styles.marketplace;
