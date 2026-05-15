import React, { useMemo } from 'react';
import { View, StyleSheet, FlatList } from 'react-native';
import { SkeletonPulse } from '@/components/SkeletonPulse';
import { useHomeMarketplaceGridInset } from '@/lib/responsiveLayout';
import { SHOP_CARD_RAIL_WIDTH, SHOP_CARD_RAIL_MARGIN_END } from './ShopCard';
import { spacing, radius, cardStyles, colors } from '@/theme';

export type ShopsRailSkeletonProps = {
  contentInset?: number;
};

const PLACEHOLDER_COUNT = 3;

function ShopCardSkeleton() {
  return (
    <View style={styles.card}>
      <SkeletonPulse style={styles.banner} />
      <View style={styles.body}>
        <SkeletonPulse style={styles.logo} />
        <SkeletonPulse style={styles.lineLg} />
        <SkeletonPulse style={styles.lineSm} />
        <SkeletonPulse style={styles.lineMd} />
      </View>
    </View>
  );
}

export function ShopsRailSkeleton({ contentInset }: ShopsRailSkeletonProps = {}) {
  const gridInset = useHomeMarketplaceGridInset();
  const inset = contentInset ?? gridInset;
  const railContentStyle = useMemo(
    () => [styles.scrollContent, { paddingLeft: inset, paddingRight: inset }],
    [inset]
  );
  const data = Array.from({ length: PLACEHOLDER_COUNT }, (_, i) => i);

  return (
    <FlatList
      data={data}
      keyExtractor={(item) => String(item)}
      horizontal
      showsHorizontalScrollIndicator={false}
      scrollEnabled={false}
      contentContainerStyle={railContentStyle}
      style={styles.scroll}
      ItemSeparatorComponent={() => <View style={{ width: 0 }} />}
      renderItem={() => <ShopCardSkeleton />}
    />
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingBottom: spacing.sm,
  },
  card: {
    width: SHOP_CARD_RAIL_WIDTH,
    marginRight: SHOP_CARD_RAIL_MARGIN_END,
    ...cardStyles.default,
    overflow: 'hidden',
    padding: 0,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
  },
  banner: {
    height: 54,
    width: '100%',
    borderRadius: 0,
  },
  body: {
    padding: spacing.sm,
    paddingTop: spacing.xs,
    gap: spacing.xs,
  },
  logo: {
    width: 40,
    height: 40,
    borderRadius: radius.lg,
    marginTop: -18,
  },
  lineLg: {
    height: 14,
    width: '78%',
    borderRadius: 6,
    marginTop: spacing.xs,
  },
  lineSm: {
    height: 10,
    width: '42%',
    borderRadius: 5,
  },
  lineMd: {
    height: 10,
    width: '55%',
    borderRadius: 5,
  },
});
