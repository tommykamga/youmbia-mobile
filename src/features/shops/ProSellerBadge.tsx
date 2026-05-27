/**
 * Badges vendeur pro / boutique vérifiée (Espace Vendeur Pro V1).
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { SellerBadge } from '@/features/listings/SellerBadge';
import { spacing } from '@/theme';
import { isShopPubliclyActive, shouldShowProSellerBadge, shouldShowVerifiedShopBadge } from '@/lib/shopSeller';
import type { ShopSummary } from '@/types/shops';

type ProSellerBadgeProps = {
  listingShopId?: string | null;
  sellerType?: string | null;
  shop?: Pick<ShopSummary, 'is_verified' | 'status'> | null;
  compact?: boolean;
};

export function ProSellerBadge({
  listingShopId,
  sellerType,
  shop,
  compact = false,
}: ProSellerBadgeProps) {
  const showPro = shouldShowProSellerBadge({ listingShopId, sellerType });
  const showVerified = shouldShowVerifiedShopBadge(shop) && isShopPubliclyActive(shop);

  if (!showPro && !showVerified) {
    return null;
  }

  return (
    <View style={[styles.row, compact && styles.rowCompact]}>
      {showPro ? <SellerBadge variant="pro" label="Vendeur Pro" dense={compact} /> : null}
      {showVerified ? (
        <SellerBadge variant="verifiedShop" label="Boutique vérifiée" dense={compact} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  rowCompact: {
    marginTop: 0,
    gap: 4,
  },
});
