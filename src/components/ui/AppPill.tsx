/**
 * AppPill — chip cliquable (icône + label), style marketplace.
 */

import React from 'react';
import { Text, StyleSheet, TouchableOpacity } from 'react-native';
import { ui } from '@/theme';

export type AppPillProps = {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  accessibilityLabel?: string;
};

export function AppPill({ icon, label, onPress, accessibilityLabel }: AppPillProps) {
  return (
    <TouchableOpacity
      style={styles.wrap}
      onPress={onPress}
      activeOpacity={0.88}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
    >
      {icon}
      <Text style={styles.label}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: ui.spacing.md,
    paddingVertical: ui.spacing.sm,
    borderRadius: ui.radius.pill,
    backgroundColor: ui.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: ui.colors.borderLight,
    flexShrink: 0,
  },
  label: {
    marginLeft: ui.spacing.sm,
    ...ui.typography.bodySmall,
    fontWeight: '500',
    color: ui.colors.primary,
  },
});
