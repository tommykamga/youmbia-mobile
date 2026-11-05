/**
 * Section accueil — Boutiques populaires (PRO, featured puis activité).
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, FlatList, type ImageSourcePropType } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AppSectionHeader } from '@/components';
import { getPopularShopsCached } from '@/services/shops/popularShopsCache';
import type { PopularShop } from '@/services/shops/getPopularShops';
import { useHomeMarketplaceGridInset } from '@/lib/responsiveLayout';
import { ShopCard, SHOP_CARD_RAIL_MARGIN_END, SHOP_CARD_HOME_STRIDE } from './ShopCard';
import { ShopsRailSkeleton } from './ShopsRailSkeleton';
import { spacing, ui } from '@/theme';

export type PopularShopsPreview = {
  shops: readonly PopularShop[];
  onOpen: (shop: PopularShop) => void;
  banners?: Readonly<Record<string, ImageSourcePropType>>;
};

export function PopularShopsSection({ preview }: { preview?: PopularShopsPreview } = {}) {
  const gridInset = useHomeMarketplaceGridInset();
  const railContentStyle = useMemo(
    () => [
      styles.scrollContent,
      { paddingLeft: gridInset, paddingRight: gridInset + SHOP_CARD_RAIL_MARGIN_END },
    ],
    [gridInset]
  );
  const headerInsetStyle = useMemo(
    () => ({ paddingHorizontal: gridInset }),
    [gridInset]
  );
  const [shops, setShops] = useState<PopularShop[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (preview) return;
    setLoading(true);
    try {
      const result = await getPopularShopsCached();
      setShops(result.data ?? []);
    } finally {
      setLoading(false);
    }
  }, [preview]);

  useEffect(() => {
    void load();
  }, [load]);

  const keyExtractor = useCallback((item: PopularShop) => item.id, []);

  const renderItem = useCallback(
    ({ item }: { item: PopularShop }) => <ShopCard variant="home" shop={item} preview={preview ? {
      onOpen: () => preview.onOpen(item), bannerSource: preview.banners?.[item.id],
    } : undefined} />,
    [preview]
  );

  const displayedShops = preview?.shops ?? shops;

  if (!preview && loading) {
    return (
      <View style={styles.section} accessibilityLabel="Chargement des boutiques à découvrir">
        <View style={[styles.headerRow, headerInsetStyle]}>
          <AppSectionHeader
            dense
            title="Boutiques à découvrir"
            subtitle={preview ? 'Démonstration · destinations simulées' : undefined}
          />
        </View>
        <ShopsRailSkeleton home contentInset={gridInset} />
      </View>
    );
  }

  if (displayedShops.length === 0) {
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
            title="Boutiques à découvrir"
            subtitle={preview ? 'Démonstration · destinations simulées' : undefined}
          />
        </View>
      </View>
      <FlatList
        data={displayedShops}
        keyExtractor={keyExtractor}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={railContentStyle}
        style={styles.scroll}
        snapToInterval={SHOP_CARD_HOME_STRIDE}
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
    marginBottom: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
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
    paddingBottom: 2,
  },
});
