/**
 * Micro-aides vendeur — partage, annonces, photos (dismissible).
 */

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { dismissSellerTips, readSellerTipsDismissed } from '@/lib/sellerOnboardingTips';
import { colors, spacing, typography, fontWeights, radius } from '@/theme';

const TIPS = [
  {
    icon: 'share-social-outline' as const,
    title: 'Partagez votre boutique',
    body: 'Envoyez le lien à vos clients sur WhatsApp ou affichez le QR en magasin.',
  },
  {
    icon: 'albums-outline' as const,
    title: 'Publiez plusieurs annonces',
    body: 'Chaque produit attire de nouveaux acheteurs — publiez régulièrement depuis Mes annonces.',
  },
  {
    icon: 'camera-outline' as const,
    title: 'Photos nettes et lumineuses',
    body: 'Une photo claire sur fond simple augmente les contacts — pas besoin de studio.',
  },
] as const;

type SellerAcquisitionTipsProps = {
  compact?: boolean;
};

export function SellerAcquisitionTips({ compact = false }: SellerAcquisitionTipsProps) {
  const [dismissed, setDismissed] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    readSellerTipsDismissed()
      .then((value) => {
        if (active) setDismissed(value);
      })
      .catch(() => {
        if (active) setDismissed(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    void dismissSellerTips();
  }, []);

  if (dismissed === null || dismissed) {
    return null;
  }

  return (
    <View style={[styles.card, compact && styles.cardCompact]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Conseils vendeur</Text>
        <Pressable
          onPress={handleDismiss}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Masquer les conseils"
          style={({ pressed }) => [styles.dismissBtn, pressed && styles.dismissPressed]}
        >
          <Ionicons name="close" size={18} color={colors.textMuted} />
        </Pressable>
      </View>
      {TIPS.map((tip) => (
        <View key={tip.title} style={styles.tipRow}>
          <View style={styles.iconWrap}>
            <Ionicons name={tip.icon} size={16} color={colors.primary} />
          </View>
          <View style={styles.tipText}>
            <Text style={styles.tipTitle}>{tip.title}</Text>
            <Text style={styles.tipBody}>{tip.body}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: spacing.base,
    padding: spacing.base,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.surfaceSubtle,
    gap: spacing.sm,
  },
  cardCompact: {
    marginTop: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  headerTitle: {
    ...typography.xs,
    fontWeight: fontWeights.semibold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  dismissBtn: {
    padding: 2,
  },
  dismissPressed: {
    opacity: 0.7,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary + '12',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tipText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  tipTitle: {
    ...typography.sm,
    fontWeight: fontWeights.semibold,
    color: colors.text,
  },
  tipBody: {
    ...typography.sm,
    color: colors.textMuted,
    lineHeight: 20,
  },
});
