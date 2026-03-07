/**
 * SectionTitle – section heading with optional action link.
 * Web: .heading-subsection (text-lg font-bold), border-b border-slate-100 pb-4.
 */

import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { colors, spacing, typography, fontWeights } from '@/theme';

type SectionTitleProps = {
  title: string;
  /** Optional subtitle or caption below the title. */
  subtitle?: string;
  /** Optional right-side element (e.g. "Voir plus" link). */
  right?: React.ReactNode;
  style?: ViewStyle;
};

export function SectionTitle({ title, subtitle, right, style }: SectionTitleProps) {
  return (
    <View style={[styles.wrapper, style]}>
      <View style={styles.row}>
        <Text style={styles.title}>{title}</Text>
        {right ? <View style={styles.right}>{right}</View> : null}
      </View>
      {subtitle ? (
        <Text style={styles.subtitle}>{subtitle}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: spacing.base,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    ...typography.lg,
    fontWeight: fontWeights.bold,
    color: colors.text,
    flex: 1,
  },
  right: {
    marginLeft: spacing.sm,
  },
  subtitle: {
    ...typography.sm,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
});
