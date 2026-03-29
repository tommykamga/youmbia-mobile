/**
 * Symbole YOUMBIA seul (même calque que l’adaptive icon / icône app).
 * PNG attendu : transparence, pas de fond blanc — aligné sur android-icon-foreground.
 */

import React from 'react';
import { Image, ImageStyle, StyleProp, StyleSheet } from 'react-native';

const SYMBOL_SOURCE = require('../../assets/images/android-icon-foreground.png');

type BrandSymbolProps = {
  /** Côté du carré d’affichage (px). */
  size: number;
  style?: StyleProp<ImageStyle>;
};

export function BrandSymbol({ size, style }: BrandSymbolProps) {
  return (
    <Image
      source={SYMBOL_SOURCE}
      style={[styles.img, { width: size, height: size }, style]}
      resizeMode="contain"
      accessibilityLabel="YOUMBIA"
    />
  );
}

const styles = StyleSheet.create({
  img: {
    backgroundColor: 'transparent',
  },
});
