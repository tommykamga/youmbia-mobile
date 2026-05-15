/**
 * Micro-réassurances marketplace — ton moderne, discret, non alarmiste.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, spacing, typography, radius, fontWeights } from '@/theme';

const TIPS = [
  'Rencontrez-vous dans un lieu public pour échanger.',
  'Vérifiez le produit avant tout paiement.',
  'YOUMBIA ne gère pas encore les paiements entre acheteurs et vendeurs.',
] as const;

type MarketplaceTrustTipsProps = {
  compact?: boolean;
};

export function MarketplaceTrustTips({ compact = false }: MarketplaceTrustTipsProps) {
  return (
    <View style={[styles.card, compact && styles.cardCompact]} accessibilityRole="text">
      <View style={styles.header}>
        <Ionicons name="shield-checkmark-outline" size={16} color={colors.primary} />
        <Text style={styles.title}>Conseils sécurité</Text>
      </View>
      {TIPS.map((tip) => (
        <View key={tip} style={styles.tipRow}>
          <Text style={styles.bullet}>·</Text>
          <Text style={styles.tipText}>{tip}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: spacing.lg,
    padding: spacing.base,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.surfaceSubtle,
    gap: spacing.xs,
  },
  cardCompact: {
    marginTop: spacing.base,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  title: {
    ...typography.xs,
    fontWeight: fontWeights.semibold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
  },
  bullet: {
    ...typography.sm,
    color: colors.textMuted,
    lineHeight: 20,
  },
  tipText: {
    ...typography.sm,
    color: colors.textMuted,
    flex: 1,
    lineHeight: 20,
  },
});
