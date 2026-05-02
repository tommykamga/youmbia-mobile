/**
 * Skeleton placeholder for a listing card — aligné sur ListingCard (standard ou fil home).
 * Utilise SkeletonShimmer pour une animation premium.
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { spacing, radius, cardStyles, ui } from '@/theme';
import { SkeletonShimmer } from './SkeletonShimmer';

const IMAGE_HEIGHT = 160;
const CARD_RADIUS = 16;
/** Mêmes valeurs que ListingCard (feedPresentation home). */
const IMAGE_HEIGHT_HOME = 240;
const CARD_RADIUS_HOME = 16;

export type SkeletonListingCardProps = {
  feedPresentation?: 'standard' | 'home';
};

export function SkeletonListingCard({ feedPresentation = 'standard' }: SkeletonListingCardProps) {
  const isHome = feedPresentation === 'home';

  return (
    <View style={[styles.card, isHome && styles.cardHome]}>
      <SkeletonShimmer 
        style={[styles.image, isHome && styles.imageHome]} 
        borderRadius={isHome ? CARD_RADIUS_HOME : CARD_RADIUS}
      />
      <View style={[styles.body, isHome && styles.bodyHome]}>
        {isHome ? <SkeletonShimmer style={styles.priceLineHome} borderRadius={radius.sm} /> : null}
        <SkeletonShimmer style={[styles.titleLine, styles.titleLineFirst]} borderRadius={radius.sm} />
        <SkeletonShimmer style={[styles.titleLine, styles.titleLineShort]} borderRadius={radius.sm} />
        <SkeletonShimmer style={[styles.metaLine, isHome && styles.metaLineHome]} borderRadius={radius.sm} />
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
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(15, 23, 42, 0.05)',
  },
  cardHome: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.05)',
    borderRadius: CARD_RADIUS_HOME,
    ...ui.shadow.soft,
  },
  image: {
    width: '100%',
    height: IMAGE_HEIGHT,
  },
  imageHome: {
    height: IMAGE_HEIGHT_HOME,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  body: {
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    paddingBottom: spacing.base,
    minHeight: 72,
    gap: spacing.xs,
  },
  bodyHome: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 22,
    minHeight: 100,
    gap: 6,
  },
  priceLineHome: {
    height: 22,
    width: '45%',
    marginBottom: 8,
  },
  titleLine: {
    height: 16,
    maxWidth: '100%',
  },
  titleLineFirst: {
    width: '90%',
  },
  titleLineShort: {
    width: '60%',
    marginBottom: 4,
  },
  metaLine: {
    height: 14,
    width: '50%',
  },
  metaLineHome: {
    width: '40%',
    marginTop: 4,
  },
});
