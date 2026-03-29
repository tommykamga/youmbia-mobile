/**
 * Skeleton placeholder for a listing card – aligné sur ListingCard immersive (image 160, bloc info).
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors, spacing, radius, cardStyles } from '@/theme';
import { SkeletonPulse } from '@/components/SkeletonPulse';

const IMAGE_HEIGHT = 160;
const CARD_RADIUS = 16;

export function SkeletonListingCard() {
  return (
    <View style={styles.card}>
      <SkeletonPulse style={styles.image} />
      <View style={styles.body}>
        <SkeletonPulse>
          <View style={[styles.titleLine, styles.titleLineFirst]} />
          <View style={[styles.titleLine, styles.titleLineShort]} />
          <View style={styles.metaLine} />
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
  image: {
    width: '100%',
    height: IMAGE_HEIGHT,
    borderRadius: CARD_RADIUS,
    backgroundColor: colors.surfaceMuted,
  },
  body: {
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    paddingBottom: spacing.base,
    minHeight: 72,
    justifyContent: 'flex-start',
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
});
