/**
 * AppSearchBar — champ recherche « fake » (tap → navigation), style aligné home.
 */

import React from 'react';
import { Pressable, Text, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { shadows, ui } from '@/theme';

export type AppSearchBarProps = {
  placeholder: string;
  onPress: () => void;
  compact?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

export function AppSearchBar({
  placeholder,
  onPress,
  compact = false,
  accessibilityLabel = 'Rechercher',
  style,
}: AppSearchBarProps) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.bar,
        compact && styles.barCompact,
        pressed && styles.barPressed,
        style,
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Ionicons
        name="search"
        size={compact ? 20 : 22}
        color={ui.colors.textMuted}
        style={styles.icon}
      />
      <Text
        style={[styles.placeholder, compact && styles.placeholderCompact]}
        numberOfLines={1}
        ellipsizeMode="tail"
      >
        {placeholder}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.04)',
    borderRadius: ui.radius.pill,
    paddingVertical: ui.spacing.md,
    paddingHorizontal: ui.spacing.lg + 4,
    marginTop: ui.spacing.sm,
    marginBottom: ui.spacing.xl,
    minHeight: 58,
    // Stronger premium floating shadow (Leboncoin/AirBnb style dominance)
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 12,
  },
  barCompact: {
    paddingVertical: ui.spacing.md,
    paddingHorizontal: ui.spacing.md + 4,
    marginTop: ui.spacing.sm,
    marginBottom: ui.spacing.lg,
    minHeight: 52,
  },
  barPressed: {
    opacity: 0.96,
    backgroundColor: ui.colors.primarySoft,
    transform: [{ scale: 0.988 }],
  },
  icon: {
    marginRight: ui.spacing.md,
  },
  placeholder: {
    ...ui.typography.body,
    color: ui.colors.textSecondary,
    flex: 1,
    minWidth: 0,
  },
  placeholderCompact: {
    fontSize: 14,
    lineHeight: 20,
  },
});
