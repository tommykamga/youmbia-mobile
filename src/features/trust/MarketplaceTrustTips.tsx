/**
 * Micro-réassurances marketplace — ton moderne, discret, non alarmiste.
 */

import React from 'react';
import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, spacing, typography, radius, fontWeights } from '@/theme';

const TIPS = [
  'Rencontrez-vous dans un lieu public pour échanger.',
  'Vérifiez le produit avant tout paiement.',
  'YOUMBIA ne gère pas encore les paiements entre acheteurs et vendeurs.',
] as const;

type MarketplaceTrustTipsProps = {
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function MarketplaceTrustTips({ compact = false, style }: MarketplaceTrustTipsProps) {
  return (
    <View
      style={[styles.card, compact && styles.cardCompact, style]}
      accessibilityRole="text"
    >
      <View style={styles.header}>
        <View style={styles.iconBadge}>
          <Ionicons name="shield-checkmark" size={14} color={colors.primary} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title}>Conseils sécurité</Text>
          <Text style={styles.subtitle}>Pour acheter en confiance</Text>
        </View>
      </View>
      <View style={styles.tipsList}>
        {TIPS.map((tip) => (
          <View key={tip} style={styles.tipRow}>
            <View style={styles.tipDot} />
            <Text style={styles.tipText}>{tip}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: spacing.lg,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.base,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.primary + '14',
    backgroundColor: colors.surface,
    gap: spacing.md,
  },
  cardCompact: {
    marginTop: spacing.base,
    paddingVertical: spacing.base,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  iconBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary + '0D',
    borderWidth: 1,
    borderColor: colors.primary + '18',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  title: {
    ...typography.sm,
    fontWeight: fontWeights.semibold,
    color: colors.text,
    letterSpacing: -0.1,
  },
  subtitle: {
    ...typography.xs,
    color: colors.textMuted,
  },
  tipsList: {
    gap: spacing.sm,
    paddingLeft: 2,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  tipDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    marginTop: 7,
    backgroundColor: colors.primary + '55',
  },
  tipText: {
    ...typography.sm,
    color: colors.textSecondary,
    flex: 1,
    lineHeight: 21,
  },
});
