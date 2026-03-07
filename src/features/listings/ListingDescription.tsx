/**
 * ListingDescription – description block with premium spacing and typography rhythm.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, typography, fontWeights } from '@/theme';

type ListingDescriptionProps = {
  description: string;
};

export function ListingDescription({ description }: ListingDescriptionProps) {
  if (!description?.trim()) return null;

  return (
    <View style={styles.block}>
      <Text style={styles.label}>Description</Text>
      <Text style={styles.text}>{description.trim()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    marginBottom: spacing.xl,
  },
  label: {
    ...typography.sm,
    fontWeight: fontWeights.bold,
    color: colors.textSecondary,
    marginBottom: spacing.md,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  text: {
    ...typography.base,
    color: colors.text,
    lineHeight: 26,
  },
});
