/**
 * Section optionnelle — vendeurs vérifiés (horizontal, discret).
 * Réutilise le cache mémoire de PopularShopsSection quand disponible.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, FlatList } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AppSectionHeader } from '@/components';
import { getPopularShopsCached } from '@/services/shops/popularShopsCache';
import type { PopularShop } from '@/services/shops/getPopularShops';
import { useHomeMarketplaceGridInset } from '@/lib/responsiveLayout';
import { ShopCard } from './ShopCard';
import { spacing, colors } from '@/theme';

const VERIFIED_LIMIT = 6;
const MIN_VERIFIED_TO_SHOW = 2;

export function VerifiedShopsSection() {
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
      const result = await getPopularShopsCached(12);
      const verified = (result.data ?? [])
        .filter((s) => s.is_verified)
        .slice(0, VERIFIED_LIMIT);
      setShops(verified);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading || shops.length < MIN_VERIFIED_TO_SHOW) {
    return null;
  }

  return (
    <View style={styles.section}>
      <View style={[styles.headerRow, headerInsetStyle]}>
        <Ionicons
          name="shield-checkmark-outline"
          size={16}
          color={colors.primary}
          style={styles.headerIcon}
        />
        <View style={styles.headerText}>
          <AppSectionHeader dense title="Vendeurs vérifiés" subtitle="Boutiques de confiance" />
        </View>
      </View>
      <FlatList
        data={shops}
        keyExtractor={(item) => item.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={railContentStyle}
        style={styles.scroll}
        renderItem={({ item }) => <ShopCard shop={item} variant="compact" />}
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
    marginBottom: spacing.xs,
  },
  headerIcon: {
    marginRight: spacing.sm,
  },
  headerText: {
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
