/**
 * EmptyState – icon, message, optional action when list/content is empty.
 * Web: "Aucune annonce", "Aucun résultat" blocks (rounded-2xl bg-white p-16 text-center).
 */

import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { colors, spacing, typography, fontWeights } from '@/theme';

type EmptyStateProps = {
  title: string;
  message?: string;
  /** Optional action (e.g. Button "Voir toutes les annonces"). */
  action?: React.ReactNode;
  style?: ViewStyle;
};

export function EmptyState({ title, message, action, style }: EmptyStateProps) {
  return (
    <View style={[styles.wrapper, style]}>
      <Text style={styles.title}>{title}</Text>
      {message ? (
        <Text style={styles.message}>{message}</Text>
      ) : null}
      {action ? (
        <View style={styles.action}>{action}</View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingVertical: spacing['4xl'],
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...typography.lg,
    fontWeight: fontWeights.bold,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  message: {
    ...typography.base,
    color: colors.textMuted,
    textAlign: 'center',
    maxWidth: 280,
    marginBottom: spacing.xl,
  },
  action: {
    marginTop: spacing.sm,
  },
});
