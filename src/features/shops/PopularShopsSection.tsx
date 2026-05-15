/**
 * Section accueil — Boutiques populaires (PRO, featured puis activité).
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, FlatList } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AppSectionHeader } from '@/components';
import { getPopularShopsCached } from '@/services/shops/popularShopsCache';
import type { PopularShop } from '@/services/shops/getPopularShops';
import { useHomeMarketplaceGridInset } from '@/lib/responsiveLayout';
import { ShopCard, SHOP_CARD_RAIL_STRIDE } from './ShopCard';
import { ShopsRailSkeleton } from './ShopsRailSkeleton';
import { spacing, ui } from '@/theme';

export function PopularShopsSection() {
  const gridInset = useHomeMarketplaceGridInset();
  const railContentStyle = useMemo(
    () => [styles.scrollContent, { paddingLeft: gridInset, paddingRight: gridInset }],
    [gridInset]
  );
  const headerInsetStyle = useMemo(
    () => ({ paddingHorizontal: gridInset }),
    [gridInset]
  );
  const [shops, setShops] = useState<PopularShop[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getPopularShopsCached();
      setShops(result.data ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const keyExtractor = useCallback((item: PopularShop) => item.id, []);

  const renderItem = useCallback(
    ({ item }: { item: PopularShop }) => <ShopCard shop={item} />,
    []
  );

  if (loading) {
    return (
      <View style={styles.section} accessibilityLabel="Chargement des boutiques populaires">
        <View style={[styles.headerRow, headerInsetStyle]}>
          <AppSectionHeader
            dense
            title="Boutiques populaires"
            subtitle="Commerçants professionnels YOUMBIA"
          />
        </View>
        <ShopsRailSkeleton contentInset={gridInset} />
      </View>
    );
  }

  if (shops.length === 0) {
    return null;
  }

  return (
    <View style={styles.section}>
      <View style={[styles.headerRow, headerInsetStyle]}>
        <Ionicons
          name="storefront-outline"
          size={17}
          color={ui.colors.primary}
          style={styles.headerIcon}
        />
        <View style={styles.headerTextSlot}>
          <AppSectionHeader
            dense
            title="Boutiques populaires"
            subtitle="Commerçants professionnels YOUMBIA"
          />
        </View>
      </View>
      <FlatList
        data={shops}
        keyExtractor={keyExtractor}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={railContentStyle}
        style={styles.scroll}
        snapToInterval={SHOP_CARD_RAIL_STRIDE}
        snapToAlignment="start"
        decelerationRate="fast"
        renderItem={renderItem}
        removeClippedSubviews
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  headerIcon: {
    marginRight: spacing.sm,
  },
  headerTextSlot: {
    flex: 1,
    minWidth: 0,
  },
  scroll: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingBottom: spacing.xs,
  },
});
