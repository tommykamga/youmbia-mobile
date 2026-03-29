/**
 * Skeleton placeholder for a listing card — aligné sur ListingCard (standard ou fil home).
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors, spacing, radius, cardStyles, ui } from '@/theme';
import { SkeletonPulse } from '@/components/SkeletonPulse';

const IMAGE_HEIGHT = 160;
const CARD_RADIUS = 16;
/** Mêmes valeurs que ListingCard (feedPresentation home). */
const IMAGE_HEIGHT_HOME = 186;
const CARD_RADIUS_HOME = 20;

export type SkeletonListingCardProps = {
  feedPresentation?: 'standard' | 'home';
};

export function SkeletonListingCard({ feedPresentation = 'standard' }: SkeletonListingCardProps) {
  const isHome = feedPresentation === 'home';

  return (
    <View style={[styles.card, isHome && styles.cardHome]}>
      <SkeletonPulse style={[styles.image, isHome && styles.imageHome]} />
      <View style={[styles.body, isHome && styles.bodyHome]}>
        <SkeletonPulse>
          {isHome ? <View style={styles.priceLineHome} /> : null}
          <View style={[styles.titleLine, styles.titleLineFirst]} />
          <View style={[styles.titleLine, styles.titleLineShort]} />
          <View style={[styles.metaLine, isHome && styles.metaLineHome]} />
        </SkeletonPulse>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    ...cardStyles.default,
    overflow: 'hidden',
    padding: 0,
    borderRadius: CARD_RADIUS,
  },
  cardHome: {
    backgroundColor: ui.colors.surface,
    borderWidth: 1,
    borderColor: ui.colors.borderLight,
    borderRadius: CARD_RADIUS_HOME,
    ...ui.shadow.soft,
  },
  image: {
    width: '100%',
    height: IMAGE_HEIGHT,
    borderRadius: CARD_RADIUS,
    backgroundColor: colors.surfaceMuted,
  },
  imageHome: {
    height: IMAGE_HEIGHT_HOME,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderTopLeftRadius: CARD_RADIUS_HOME,
    borderTopRightRadius: CARD_RADIUS_HOME,
  },
  body: {
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    paddingBottom: spacing.base,
    minHeight: 72,
    justifyContent: 'flex-start',
  },
  bodyHome: {
    paddingHorizontal: ui.spacing.md,
    paddingTop: ui.spacing.md,
    paddingBottom: ui.spacing.lg,
    minHeight: 88,
  },
  priceLineHome: {
    height: 22,
    width: '42%',
    maxWidth: 140,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceSubtle,
    marginBottom: ui.spacing.sm,
  },
  titleLine: {
    height: 14,
    marginBottom: spacing.xs,
    maxWidth: '100%',
    borderRadius: radius.sm,
    backgroundColor: colors.borderLight,
  },
  titleLineFirst: {
    maxWidth: '100%',
  },
  titleLineShort: {
    maxWidth: '70%',
    marginBottom: spacing.sm,
  },
  metaLine: {
    height: 12,
    width: '58%',
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceSubtle,
  },
  metaLineHome: {
    height: 12,
    width: '52%',
    backgroundColor: colors.borderLight,
  },
});
