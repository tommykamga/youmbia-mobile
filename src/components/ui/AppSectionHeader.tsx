/**
 * AppSectionHeader — titre + sous-titre optionnel (tokens `ui`).
 * `SectionTitle` reste pour les sections avec action à droite ; celui-ci est volontairement minimal.
 */

import React from 'react';
import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { ui, colors } from '@/theme';

export type AppSectionHeaderProps = {
  title: string;
  subtitle?: string;
  style?: StyleProp<ViewStyle>;
  /** Bloc plus compact (fil d’accueil marketplace). */
  dense?: boolean;
};

export function AppSectionHeader({ title, subtitle, style, dense }: AppSectionHeaderProps) {
  return (
    <View style={[styles.wrap, style]} accessibilityRole="header">
      <Text style={[styles.title, dense && styles.titleDense]}>{title}</Text>
      {subtitle ? <Text style={[styles.subtitle, dense && styles.subtitleDense]}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 0,
  },
  title: {
    ...ui.typography.h2,
    letterSpacing: -0.35,
    color: ui.colors.textPrimary,
  },
  titleDense: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  subtitle: {
    ...ui.typography.caption,
    marginTop: ui.spacing.sm,
    color: ui.colors.textMuted,
  },
  subtitleDense: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 16,
    color: colors.textTertiary,
    fontWeight: '400',
  },
});
