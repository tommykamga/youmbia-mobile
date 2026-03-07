/**
 * LoadingState – centered spinner with optional message.
 * Web: loading skeletons / spinners; mobile-native centered block.
 */

import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet, ViewStyle } from 'react-native';
import { colors, spacing, typography } from '@/theme';

type LoadingStateProps = {
  message?: string;
  style?: ViewStyle;
};

export function LoadingState({ message, style }: LoadingStateProps) {
  return (
    <View style={[styles.wrapper, style]}>
      <ActivityIndicator size="large" color={colors.primary} />
      {message ? (
        <Text style={styles.message}>{message}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing['4xl'],
    paddingHorizontal: spacing.xl,
  },
  message: {
    ...typography.sm,
    color: colors.textMuted,
    marginTop: spacing.base,
  },
});
