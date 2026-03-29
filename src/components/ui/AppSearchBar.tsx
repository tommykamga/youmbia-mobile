/**
 * AppSearchBar — champ recherche « fake » (tap → navigation), style aligné home.
 */

import React from 'react';
import { Pressable, Text, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { shadows, ui } from '@/theme';

/** Vert YOUMBIA atténué (~60 %), pas le primaire plein (`#16A34A`). */
const SEARCH_ICON_GREEN = 'rgba(22, 163, 74, 0.6)';

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
        color={SEARCH_ICON_GREEN}
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
    backgroundColor: ui.colors.surface,
    borderWidth: 1,
    borderColor: ui.colors.border,
    borderRadius: ui.radius.pill,
    paddingVertical: ui.spacing.md + 2,
    paddingHorizontal: ui.spacing.lg,
    marginTop: ui.spacing.sm,
    marginBottom: ui.spacing.xl,
    minHeight: 52,
    ...shadows.sm,
  },
  barCompact: {
    paddingVertical: ui.spacing.md,
    paddingHorizontal: ui.spacing.md,
    marginTop: ui.spacing.sm,
    marginBottom: ui.spacing.lg,
    minHeight: 48,
  },
  barPressed: {
    opacity: 0.96,
    backgroundColor: ui.colors.surfaceSubtle,
    transform: [{ scale: 0.988 }],
  },
  icon: {
    marginRight: ui.spacing.sm,
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
