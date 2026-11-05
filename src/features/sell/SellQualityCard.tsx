import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import type { ListingQualityResult } from '@/lib/listingQualityScore';
import { colors, spacing, typography, fontWeights, radius } from '@/theme';

type SellQualityCardProps = {
  quality: ListingQualityResult;
  compact?: boolean;
  onImprovePress?: () => void;
};

export function SellQualityCard({
  quality,
  compact = false,
  onImprovePress,
}: SellQualityCardProps) {
  const tip = quality.priorityTip ?? quality.subtitle;

  return (
    <View
      style={[styles.card, compact && styles.cardCompact]}
      accessibilityRole="progressbar"
      accessibilityLabel={`Qualité de l'annonce : ${quality.score} sur 100. ${quality.label}`}
      accessibilityValue={{
        min: 0,
        max: 100,
        now: quality.score,
        text: `${quality.score} sur 100`,
      }}
    >
      <View style={styles.header}>
        <Text style={styles.title} maxFontSizeMultiplier={1.3}>
          Qualité de l&apos;annonce
        </Text>
        <Text style={styles.score} maxFontSizeMultiplier={1.2}>
          {quality.score}
          <Text style={styles.scoreSuffix}>/100</Text>
        </Text>
      </View>
      <Text style={styles.label} maxFontSizeMultiplier={1.3}>
        {quality.label}
      </Text>
      <View style={styles.track} accessibilityElementsHidden>
        <View style={[styles.fill, { width: `${Math.min(100, quality.progressRatio * 100)}%` }]} />
      </View>
      <Text style={styles.subtitle} numberOfLines={compact ? 2 : 4} maxFontSizeMultiplier={1.35}>
        {tip}
      </Text>
      {onImprovePress ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Améliorer mon annonce"
          onPress={onImprovePress}
          style={({ pressed }) => [styles.improveBtn, pressed && styles.improveBtnPressed]}
        >
          <Text style={styles.improveBtnText} maxFontSizeMultiplier={1.3}>
            Améliorer mon annonce
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.base,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderLight,
    backgroundColor: colors.surface,
    gap: spacing.sm,
  },
  cardCompact: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  title: {
    ...typography.sm,
    fontWeight: fontWeights.bold,
    color: colors.text,
    flex: 1,
  },
  score: {
    fontSize: typography.xl.fontSize,
    lineHeight: typography.xl.lineHeight,
    fontWeight: fontWeights.bold,
    color: colors.primary,
    fontVariant: ['tabular-nums'],
  },
  scoreSuffix: {
    ...typography.sm,
    fontWeight: fontWeights.semibold,
    color: colors.textMuted,
  },
  label: {
    ...typography.xs,
    fontWeight: fontWeights.semibold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  subtitle: {
    ...typography.sm,
    color: colors.textMuted,
    lineHeight: 20,
  },
  track: {
    height: 8,
    borderRadius: radius.full,
    backgroundColor: colors.borderLight,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    minWidth: 4,
  },
  improveBtn: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.primary + '44',
    backgroundColor: colors.primary + '0A',
  },
  improveBtnPressed: {
    opacity: 0.88,
  },
  improveBtnText: {
    ...typography.sm,
    fontWeight: fontWeights.semibold,
    color: colors.primary,
  },
});
