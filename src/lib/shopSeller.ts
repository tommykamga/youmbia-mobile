import type { ShopSummary } from '@/types/shops';

export function isProSellerType(sellerType: string | null | undefined): boolean {
  return sellerType === 'pro';
}

/** Afficher le badge PRO si l’annonce ou le profil vendeur est pro. */
export function shouldShowProSellerBadge(options: {
  listingShopId?: string | null;
  sellerType?: string | null;
}): boolean {
  if (options.listingShopId) {
    return true;
  }
  return isProSellerType(options.sellerType);
}

export function shouldShowVerifiedShopBadge(shop?: Pick<ShopSummary, 'is_verified'> | null): boolean {
  return shop?.is_verified === true;
}

export function isShopPubliclyActive(
  shop?: Pick<ShopSummary, 'status'> | null
): boolean {
  return (shop?.status ?? 'active') === 'active';
}

export function getShopInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return '?';
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}
