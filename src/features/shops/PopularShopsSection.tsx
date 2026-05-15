/**
 * Section accueil — Boutiques populaires (PRO, featured puis activité).
 */

import React, { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet, FlatList } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AppSectionHeader } from '@/components';
import { getPopularShopsCached } from '@/services/shops/popularShopsCache';
import type { PopularShop } from '@/services/shops/getPopularShops';
import { ShopCard, SHOP_CARD_RAIL_STRIDE } from './ShopCard';
import { ShopsRailSkeleton } from './ShopsRailSkeleton';
import { spacing, ui } from '@/theme';

export function PopularShopsSection() {
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
        <AppSectionHeader
          dense
          title="Boutiques populaires"
          subtitle="Commerçants professionnels YOUMBIA"
        />
        <ShopsRailSkeleton />
      </View>
    );
  }

  if (shops.length === 0) {
    return null;
  }

  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <View style={styles.headerIconSlot}>
          <Ionicons name="storefront-outline" size={20} color={ui.colors.primary} />
        </View>
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
        contentContainerStyle={styles.scrollContent}
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
    marginBottom: spacing.lg,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.base,
  },
  headerIconSlot: {
    paddingTop: 6,
    marginRight: spacing.xs,
  },
  headerTextSlot: {
    flex: 1,
    marginLeft: -spacing.base,
  },
  scroll: {
    marginHorizontal: -spacing.base,
  },
  scrollContent: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.xs,
  },
});
