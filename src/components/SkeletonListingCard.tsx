/**
 * Skeleton placeholder for a listing card — aligné sur ListingCard (standard ou fil home).
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors, spacing, radius, cardStyles, ui } from '@/theme';
import { SkeletonPulse } from '@/components/SkeletonPulse';

const IMAGE_HEIGHT = 160;
const CARD_RADIUS = 16;
const CARD_RADIUS_HOME = 20;
/** Aligné sur ListingCard (home) — image plus haute (~1.2). */
const HOME_IMAGE_ASPECT_RATIO = 1 / 1.2;

export type SkeletonListingCardProps = {
  feedPresentation?: 'standard' | 'home';
};

export function SkeletonListingCard({ feedPresentation = 'standard' }: SkeletonListingCardProps) {
  const isHome = feedPresentation === 'home';

  return (
    <View style={[styles.card, isHome && styles.cardHome, isHome && styles.cardHomeBleed]}>
      <SkeletonPulse
        style={[
          styles.imageBase,
          !isHome && styles.imageHeight,
          isHome && styles.imageHomeShape,
          isHome && styles.imageHomeAspect,
        ]}
      />
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
  cardHomeBleed: {
    marginHorizontal: 0,
  },
  imageBase: {
    width: '100%',
    backgroundColor: colors.surfaceMuted,
  },
  imageHeight: {
    height: IMAGE_HEIGHT,
    borderRadius: CARD_RADIUS,
  },
  imageHomeShape: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderTopLeftRadius: CARD_RADIUS_HOME,
    borderTopRightRadius: CARD_RADIUS_HOME,
  },
  imageHomeAspect: {
    aspectRatio: HOME_IMAGE_ASPECT_RATIO,
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
