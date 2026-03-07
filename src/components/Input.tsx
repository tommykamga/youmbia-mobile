/**
 * Input – single-line text field with label and error.
 * Web: rounded-xl border-slate-200 focus:ring-youmbia-green (HomeHero, forms).
 */

import React from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TextInputProps,
  ViewStyle,
} from 'react-native';
import { colors, spacing, radius, typography, fontWeights } from '@/theme';

type InputProps = TextInputProps & {
  label?: string;
  error?: string;
  containerStyle?: ViewStyle;
};

export function Input({
  label,
  error,
  containerStyle,
  placeholderTextColor = colors.textMuted,
  style,
  ...rest
}: InputProps) {
  return (
    <View style={[styles.container, containerStyle]}>
      {label ? (
        <Text style={styles.label}>{label}</Text>
      ) : null}
      <TextInput
        placeholderTextColor={placeholderTextColor}
        style={[
          styles.input,
          error ? styles.inputError : undefined,
          style,
        ]}
        {...rest}
      />
      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.base,
  },
  label: {
    ...typography.sm,
    fontWeight: fontWeights.semibold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    ...typography.base,
    color: colors.text,
  },
  inputError: {
    borderColor: colors.error,
  },
  error: {
    ...typography.sm,
    color: colors.error,
    marginTop: spacing.xs,
  },
});
