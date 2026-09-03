/**
 * Visual-only recent searches list (no fetch).
 */

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, spacing, typography, fontWeights, radius } from '@/theme';
import {
  buildRecentSearchLabel,
  type RecentSearch,
} from '@/services/recentSearches';

type SearchRecentSearchesProps = {
  items: RecentSearch[];
  visible: boolean;
  onSelect: (item: RecentSearch) => void;
  onClear: () => void;
};

export function SearchRecentSearches({
  items,
  visible,
  onSelect,
  onClear,
}: SearchRecentSearchesProps) {
  if (!visible || items.length === 0) return null;

  return (
    <View style={styles.recentSection}>
      <View style={styles.header}>
        <Text style={styles.title} maxFontSizeMultiplier={1.3}>
          Recherches récentes
        </Text>
        <Pressable
          onPress={onClear}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Effacer les recherches récentes"
        >
          <Text style={styles.clearText} maxFontSizeMultiplier={1.3}>
            Effacer
          </Text>
        </Pressable>
      </View>
      {items.map((item) => (
        <Pressable
          key={`${item.searchedAt}-${item.query}-${item.categoryId ?? ''}-${item.city ?? ''}`}
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={() => onSelect(item)}
          accessibilityRole="button"
          accessibilityLabel={buildRecentSearchLabel(item)}
        >
          <Ionicons
            name="time-outline"
            size={18}
            color={colors.textMuted}
            style={styles.icon}
          />
          <Text style={styles.rowText} numberOfLines={1} maxFontSizeMultiplier={1.3}>
            {buildRecentSearchLabel(item)}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  recentSection: {
    marginBottom: spacing.base,
    gap: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    ...typography.sm,
    fontWeight: fontWeights.bold,
    color: colors.text,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  clearText: {
    ...typography.sm,
    color: colors.primary,
    fontWeight: fontWeights.semibold,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    minHeight: 44,
  },
  rowPressed: {
    opacity: 0.92,
  },
  icon: {
    marginRight: spacing.sm,
  },
  rowText: {
    flex: 1,
    ...typography.base,
    color: colors.text,
  },
});
