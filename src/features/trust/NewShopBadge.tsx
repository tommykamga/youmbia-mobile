/**
 * Badge discret « Nouvelle boutique » (< 14 jours).
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { isNewShop } from '@/lib/shopTrust';
import { colors, spacing, typography, radius, fontWeights } from '@/theme';

type NewShopBadgeProps = {
  createdAt: string | null | undefined;
};

export function NewShopBadge({ createdAt }: NewShopBadgeProps) {
  if (!isNewShop(createdAt)) {
    return null;
  }

  return (
    <View style={styles.chip} accessibilityLabel="Nouvelle boutique">
      <Ionicons name="sparkles-outline" size={12} color={colors.textSecondary} />
      <Text style={styles.label}>Nouvelle boutique</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  label: {
    ...typography.xs,
    fontWeight: fontWeights.medium,
    color: colors.textSecondary,
  },
});
