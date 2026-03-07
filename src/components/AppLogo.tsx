/**
 * AppLogo – logo YOUMBIA réutilisable, tailles cohérentes, jamais déformé.
 * Usage: header (medium), auth/onboarding (large), ou petit contexte (small).
 */

import React from 'react';
import { Image, StyleSheet, ViewStyle } from 'react-native';

const LOGO_SOURCE = require('../../assets/images/logo.png');

export type AppLogoVariant = 'small' | 'medium' | 'large';

const SIZES: Record<AppLogoVariant, { width: number; height: number }> = {
  small: { width: 100, height: 26 },
  medium: { width: 140, height: 36 },
  large: { width: 180, height: 46 },
};

type AppLogoProps = {
  variant?: AppLogoVariant;
  style?: ViewStyle;
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
    // no stretch: explicit dimensions + contain keep aspect ratio
  },
});
