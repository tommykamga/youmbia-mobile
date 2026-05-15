/**
 * Préparation légère acquisition terrain — flags futurs (featured, campagne, boost).
 * Source de vérité actuelle : `shops.is_featured` côté Supabase.
 */

import type { PublicShop } from '@/types/shops';

/** Types réservés pour campagnes / mise en avant manuelle (non branchés en V1). */
export type ShopVisibilityBoostKind = 'featured' | 'campaign' | 'manual_boost';

export type ShopAcquisitionCampaignMeta = {
  kind: ShopVisibilityBoostKind;
  label?: string;
  startsAt?: string;
  endsAt?: string;
};

export type ShopVisibilityFlags = {
  isFeatured: boolean;
  /** Réservé — boost campagne terrain (admin futur). */
  campaignBoost: ShopAcquisitionCampaignMeta | null;
};

export function resolveShopVisibilityFlags(
  shop: Pick<PublicShop, 'is_featured'>
): ShopVisibilityFlags {
  return {
    isFeatured: shop.is_featured === true,
    campaignBoost: null,
  };
}
