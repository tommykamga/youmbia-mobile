import { supabase } from '@/lib/supabase';
import { resolveShopsMediaUrls } from '@/lib/shopMediaUrl';
import type { PublicShop } from '@/types/shops';
import { SHOP_PUBLIC_SELECT } from './shopSelect';

export type PopularShop = PublicShop & {
  active_listings_count: number;
};

export type GetPopularShopsResult =
  | { data: PopularShop[]; error: null }
  | { data: null; error: { message: string } };

const POPULAR_SHOPS_LIMIT = 10;
const LISTING_SAMPLE_FOR_COUNTS = 400;

function sortPopularShops(shops: PopularShop[]): PopularShop[] {
  return [...shops].sort((a, b) => {
    if (a.is_featured !== b.is_featured) return a.is_featured ? -1 : 1;
    if (b.active_listings_count !== a.active_listings_count) {
      return b.active_listings_count - a.active_listings_count;
    }
    return a.name.localeCompare(b.name, 'fr');
  });
}

/**
 * Boutiques PRO pour l’accueil : `is_featured` en tête, puis activité (annonces actives).
 * Requêtes bornées — pas de scan complet de la base.
 */
export async function getPopularShops(
  limit: number = POPULAR_SHOPS_LIMIT
): Promise<GetPopularShopsResult> {
  const safeLimit = Math.min(Math.max(1, limit), POPULAR_SHOPS_LIMIT);

  try {
    const [{ data: featuredRows, error: featuredError }, { data: listingRows, error: listingsError }] =
      await Promise.all([
        supabase
          .from('shops')
          .select(SHOP_PUBLIC_SELECT)
          .eq('is_featured', true)
          .order('updated_at', { ascending: false })
          .limit(safeLimit),
        supabase
          .from('listings')
          .select('shop_id')
          .eq('status', 'active')
          .not('shop_id', 'is', null)
          .limit(LISTING_SAMPLE_FOR_COUNTS),
      ]);

    if (featuredError) {
      return { data: null, error: { message: featuredError.message } };
    }
    if (listingsError) {
      return { data: null, error: { message: listingsError.message } };
    }

    const countByShopId = new Map<string, number>();
    for (const row of listingRows ?? []) {
      const shopId = String((row as { shop_id?: string | null }).shop_id ?? '').trim();
      if (!shopId) continue;
      countByShopId.set(shopId, (countByShopId.get(shopId) ?? 0) + 1);
    }

    const topIdsByActivity = [...countByShopId.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, safeLimit * 2)
      .map(([id]) => id);

    let activityShops: PublicShop[] = [];
    if (topIdsByActivity.length > 0) {
      const { data: shopRows, error: shopsError } = await supabase
        .from('shops')
        .select(SHOP_PUBLIC_SELECT)
        .in('id', topIdsByActivity);

      if (shopsError) {
        return { data: null, error: { message: shopsError.message } };
      }
      activityShops = (shopRows ?? []) as PublicShop[];
    }

    const merged = new Map<string, PopularShop>();
    for (const shop of featuredRows ?? []) {
      const s = shop as PublicShop;
      merged.set(s.id, {
        ...s,
        active_listings_count: countByShopId.get(s.id) ?? 0,
      });
    }
    for (const shop of activityShops) {
      if (merged.has(shop.id)) continue;
      merged.set(shop.id, {
        ...shop,
        active_listings_count: countByShopId.get(shop.id) ?? 0,
      });
    }

    const sorted = sortPopularShops([...merged.values()]).slice(0, safeLimit);
    const withMedia = await resolveShopsMediaUrls(sorted);
    const data: PopularShop[] = withMedia.map((shop, index) => ({
      ...shop,
      active_listings_count: sorted[index]?.active_listings_count ?? 0,
    }));
    return { data, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? '');
    return { data: null, error: { message } };
  }
}
