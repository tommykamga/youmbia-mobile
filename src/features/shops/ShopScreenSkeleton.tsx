import React from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import { SkeletonPulse } from '@/components/SkeletonPulse';
import { SkeletonListingCard } from '@/components/SkeletonListingCard';
import { spacing, radius } from '@/theme';

export function ShopScreenSkeleton() {
  const { width: screenWidth } = useWindowDimensions();
  const cardWidth = Math.floor((screenWidth - spacing.base * 2 - spacing.sm) / 2);

  return (
    <View style={styles.root}>
      <SkeletonPulse style={styles.banner} />
      <View style={styles.profileRow}>
        <SkeletonPulse style={styles.logo} />
        <View style={styles.profileText}>
          <SkeletonPulse style={styles.nameLine} />
          <SkeletonPulse style={styles.cityLine} />
          <SkeletonPulse style={styles.badgeLine} />
        </View>
      </View>
      <View style={styles.ctaRow}>
        <SkeletonPulse style={styles.cta} />
        <SkeletonPulse style={styles.cta} />
      </View>
      <SkeletonPulse style={styles.sectionTitle} />
      <View style={styles.grid}>
        {[0, 1, 2, 3].map((k) => (
          <View key={k} style={{ width: cardWidth }}>
            <SkeletonListingCard feedPresentation="standard" />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  banner: {
    height: 148,
    width: '100%',
  },
  profileRow: {
    flexDirection: 'row',
    gap: spacing.base,
    paddingHorizontal: spacing.base,
    marginTop: -28,
  },
  logo: {
    width: 72,
    height: 72,
    borderRadius: radius.xl,
  },
  profileText: {
    flex: 1,
    paddingTop: spacing.lg,
    gap: spacing.xs,
  },
  nameLine: {
    height: 22,
    width: '70%',
    borderRadius: 8,
  },
  cityLine: {
    height: 14,
    width: '40%',
    borderRadius: 6,
  },
  badgeLine: {
    height: 22,
    width: '55%',
    borderRadius: radius.full,
    marginTop: 4,
  },
  ctaRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
    marginTop: spacing.base,
  },
  cta: {
    flex: 1,
    height: 44,
    borderRadius: radius.xl,
  },
  sectionTitle: {
    height: 20,
    width: '45%',
    borderRadius: 8,
    marginHorizontal: spacing.base,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
  },
});
