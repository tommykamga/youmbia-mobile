/**
 * AppSectionHeader — titre + sous-titre optionnel (tokens `ui`).
 * `SectionTitle` reste pour les sections avec action à droite ; celui-ci est volontairement minimal.
 */

import React from 'react';
import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { ui } from '@/theme';

export type AppSectionHeaderProps = {
  title: string;
  subtitle?: string;
  style?: StyleProp<ViewStyle>;
};

export function AppSectionHeader({ title, subtitle, style }: AppSectionHeaderProps) {
  return (
    <View style={[styles.wrap, style]} accessibilityRole="header">
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
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
  subtitle: {
    ...ui.typography.caption,
    marginTop: ui.spacing.sm,
    color: ui.colors.textMuted,
  },
});
