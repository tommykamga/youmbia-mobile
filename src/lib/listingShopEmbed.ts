import type { ShopSummary } from '@/types/shops';

type ShopEmbedRow = {
  id: string;
  slug: string;
  name: string;
  logo_url?: string | null;
  is_verified: boolean;
  status?: string | null;
} | null;

/** Parse la jointure PostgREST `shops!listings_shop_id_fkey` sur une ligne listing. */
export function parseListingShopEmbed(
  shops: ShopEmbedRow | ShopEmbedRow[] | null | undefined
): ShopSummary | null {
  const raw = Array.isArray(shops) ? shops[0] : shops;
  if (!raw?.id?.trim()) return null;
  return {
    id: raw.id,
    slug: String(raw.slug ?? '').trim(),
    name: String(raw.name ?? '').trim(),
    logo_url: raw.logo_url != null ? String(raw.logo_url).trim() || null : null,
    is_verified: raw.is_verified === true,
    status:
      String(raw.status ?? 'active').toLowerCase() === 'hidden'
        ? 'hidden'
        : String(raw.status ?? 'active').toLowerCase() === 'suspended'
          ? 'suspended'
          : 'active',
  };
}
