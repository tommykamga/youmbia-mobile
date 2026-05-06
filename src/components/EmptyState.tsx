/**
 * EmptyState – icon, message, optional action when list/content is empty.
 * Web: "Aucune annonce", "Aucun résultat" blocks (rounded-2xl bg-white p-16 text-center).
 */

import React from 'react';
import { View, Text, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { colors, spacing, typography, fontWeights, radius } from '@/theme';

type EmptyStateProps = {
  title: string;
  message?: string;
  icon?: React.ReactNode;
  /** Optional action (e.g. Button "Voir toutes les annonces"). */
  action?: React.ReactNode;
  /** Visual style. `card` is legacy; `plain` is compact marketplace style. */
  variant?: 'card' | 'plain';
  style?: StyleProp<ViewStyle>;
};

export function EmptyState({
  title,
  message,
  icon,
  action,
  variant = 'card',
  style,
}: EmptyStateProps) {
  return (
    <View style={[styles.wrapper, variant === 'plain' ? styles.wrapperPlain : null, style]}>
      {icon ? (
        <View style={[styles.iconWrap, variant === 'plain' ? styles.iconWrapPlain : null]}>
          {icon}
        </View>
      ) : null}
      <Text style={[styles.title, variant === 'plain' ? styles.titlePlain : null]}>{title}</Text>
      {message ? (
        <Text style={[styles.message, variant === 'plain' ? styles.messagePlain : null]}>{message}</Text>
      ) : null}
      {action ? (
        <View style={[styles.action, variant === 'plain' ? styles.actionPlain : null]}>{action}</View>
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
    backgroundColor: colors.surface,
    borderRadius: radius['2xl'],
    borderWidth: 1,
    borderColor: colors.borderLight,
    marginHorizontal: spacing.base,
  },
  wrapperPlain: {
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.base,
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderRadius: 0,
    borderColor: 'transparent',
    marginHorizontal: 0,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSubtle,
    marginBottom: spacing.lg,
  },
  iconWrapPlain: {
    marginBottom: spacing.xl,
  },
  title: {
    ...typography.lg,
    fontWeight: fontWeights.bold,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  titlePlain: {
    ...typography.xl,
    fontWeight: fontWeights.bold,
  },
  message: {
    ...typography.base,
    color: colors.textMuted,
    textAlign: 'center',
    maxWidth: 320,
    marginBottom: spacing.lg,
  },
  messagePlain: {
    maxWidth: 340,
  },
  action: {
    marginTop: spacing.sm,
  },
  actionPlain: {
    marginTop: spacing.xl,
  },
});
