/**
 * CategoryRail – premium horizontal scrollable category pills + "Voir tout".
 * Tap category → search/category; tap "Voir tout" → full categories screen.
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { colors, spacing, typography, fontWeights, radius } from '@/theme';

const VOIR_TOUT_LABEL = 'Voir tout';

export type CategoryRailProps = {
  /** 5–7 primary category labels. */
  categories: readonly string[];
  /** Called when a category pill is tapped – navigate to search with this query. */
  onCategoryPress: (label: string) => void;
  /** Called when "Voir tout" pill is tapped – open full categories screen. */
  onVoirToutPress: () => void;
};

export function CategoryRail({
  categories,
  onCategoryPress,
  onVoirToutPress,
}: CategoryRailProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.rail}
      style={styles.scroll}
    >
      {categories.map((label) => (
        <Pressable
          key={label}
          style={({ pressed }) => [
            styles.pill,
            pressed && styles.pillPressed,
          ]}
          onPress={() => onCategoryPress(label)}
        >
          <Text style={styles.pillLabel} numberOfLines={1}>
            {label}
          </Text>
        </Pressable>
      ))}
      <Pressable
        style={({ pressed }) => [
          styles.pill,
          styles.voirToutPill,
          pressed && styles.pillPressed,
        ]}
        onPress={onVoirToutPress}
      >
        <Text style={styles.voirToutLabel} numberOfLines={1}>
          {VOIR_TOUT_LABEL}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    marginHorizontal: -spacing.base,
    marginBottom: spacing.lg,
  },
  rail: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.xs,
  },
  pill: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  pillPressed: {
    opacity: 0.9,
    backgroundColor: colors.surfaceSubtle,
  },
  pillLabel: {
    ...typography.sm,
    fontWeight: fontWeights.semibold,
    color: colors.text,
  },
  voirToutPill: {
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  voirToutLabel: {
    ...typography.sm,
    fontWeight: fontWeights.semibold,
    color: colors.primary,
  },
});
