/**
 * Skeleton placeholder for a listing card – feed "Nouvelles annonces".
 * Structure alignée sur ListingCard (image 4/3, body, titre, prix, meta).
 * Légère variation de teinte image / texte / meta pour un rendu plus crédible.
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors, spacing, radius, cardStyles } from '@/theme';

const IMAGE_ASPECT = 4 / 3;

export function SkeletonListingCard() {
  return (
    <View style={styles.card}>
      <View style={styles.imageWrap} />
      <View style={styles.body}>
        <View style={[styles.titleLine, styles.titleLineFirst]} />
        <View style={[styles.titleLine, styles.titleLineShort]} />
        <View style={styles.priceLine} />
        <View style={styles.metaLine} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    ...cardStyles.default,
    overflow: 'hidden',
    padding: 0,
  },
  imageWrap: {
    width: '100%',
    aspectRatio: IMAGE_ASPECT,
    backgroundColor: colors.surfaceMuted,
  },
  body: {
    padding: spacing.base,
  },
  titleLine: {
    height: 16,
    marginBottom: spacing.sm,
    maxWidth: '100%',
    borderRadius: radius.sm,
    backgroundColor: colors.border,
  },
  titleLineFirst: {
    maxWidth: '100%',
  },
  titleLineShort: {
    maxWidth: '70%',
  },
  priceLine: {
    height: 22,
    width: '40%',
    marginBottom: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.border,
  },
  metaLine: {
    height: 12,
    width: '58%',
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
  },
});
