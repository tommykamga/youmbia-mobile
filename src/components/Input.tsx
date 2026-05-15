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
  Platform,
} from 'react-native';
import { colors, spacing, radius, typography, fontWeights } from '@/theme';

/** Hauteur tactile alignée sur les CTA pill52. */
const INPUT_MIN_HEIGHT = 52;
const INPUT_FONT_SIZE = typography.base.fontSize;

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
  multiline,
  ...rest
}: InputProps) {
  const isMultiline = multiline === true;

  return (
    <View style={[styles.container, containerStyle]}>
      {label ? (
        <Text style={styles.label}>{label}</Text>
      ) : null}
      <View
        style={[
          styles.inputShell,
          isMultiline && styles.inputShellMultiline,
          error ? styles.inputShellError : undefined,
        ]}
      >
        <TextInput
          placeholderTextColor={placeholderTextColor}
          style={[styles.input, isMultiline && styles.inputMultiline, style]}
          textAlignVertical={isMultiline ? 'top' : 'center'}
          multiline={multiline}
          {...(Platform.OS === 'android' ? { includeFontPadding: false } : null)}
          {...rest}
        />
      </View>
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
  inputShell: {
    minHeight: INPUT_MIN_HEIGHT,
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.base,
  },
  inputShellError: {
    borderColor: colors.error,
  },
  inputShellMultiline: {
    minHeight: 96,
    justifyContent: 'flex-start',
    alignItems: 'stretch',
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  input: {
    width: '100%',
    fontSize: INPUT_FONT_SIZE,
    /** lineHeight proche de fontSize : évite le rognage bas sur iOS TextInput. */
    lineHeight: Platform.select({ ios: 20, android: 22, default: 24 }),
    color: colors.text,
    paddingVertical: 0,
    paddingHorizontal: 0,
    margin: 0,
    ...(Platform.OS === 'ios' ? { height: 22 } : { minHeight: 22 }),
  },
  inputMultiline: {
    minHeight: 72,
    lineHeight: Platform.select({ ios: 20, android: 22, default: 22 }),
    paddingTop: Platform.OS === 'ios' ? 2 : 4,
    paddingBottom: 2,
    ...(Platform.OS === 'ios' ? { height: undefined } : null),
  },
  error: {
    ...typography.sm,
    color: colors.error,
    marginTop: spacing.xs,
  },
});
