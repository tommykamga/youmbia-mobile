/**
 * AppLogo – logo YOUMBIA réutilisable, tailles cohérentes, jamais déformé.
 * Usage: auth (small / medium / large), home header (`homeLarge` / `homeRegular` / `homeCompact`).
 */

import React from 'react';
import { Image, StyleSheet, type ImageStyle, type StyleProp } from 'react-native';
import { spacing } from '@/theme';

const LOGO_SOURCE = require('../../assets/images/logo.png');

export type AppLogoVariant =
  | 'small'
  | 'medium'
  | 'large'
  /** Auth / gate — entre `medium` et `large`, densité alignée home (moins de vide vertical). */
  | 'auth'
  /** Home header — grands écrans (~+50 % vs `medium` en largeur). */
  | 'homeLarge'
  /** Home header — largeur intermédiaire. */
  | 'homeRegular'
  /** Home header — petits écrans. */
  | 'homeCompact';

const SIZES: Record<AppLogoVariant, { width: number; height: number }> = {
  small: { width: 155, height: 40 },
  medium: { width: 216, height: 55 },
  large: { width: 280, height: 70 },
  auth: { width: 248, height: 62 },
  homeLarge: { width: 324, height: 83 },
  /** ~+39 % vs `medium` : place pour icône Messages seule sur la ligne. */
  homeRegular: { width: 300, height: 76 },
  homeCompact: { width: 196, height: 50 },
};

type AppLogoProps = {
  variant?: AppLogoVariant;
  style?: StyleProp<ImageStyle>;
};

export function AppLogo({ variant = 'medium', style }: AppLogoProps) {
  const { width, height } = SIZES[variant];
  return (
    <Image
      source={LOGO_SOURCE}
      style={[styles.base, { width, height }, style]}
      resizeMode="contain"
      accessibilityLabel="YOUMBIA"
    />
  );
}

const styles = StyleSheet.create({
  base: {
    marginBottom: spacing.sm,
  },
});
