import { LIGHT_CACHE_TTL_MS } from '@/lib/lightCache';
import { getPopularShops, type PopularShop } from './getPopularShops';

const TTL_MS = LIGHT_CACHE_TTL_MS.homeFeedPublic;

let cache: { shops: PopularShop[]; savedAt: number } | null = null;

export async function getPopularShopsCached(
  limit?: number
): Promise<{ data: PopularShop[]; error: { message: string } | null }> {
  if (cache && Date.now() - cache.savedAt <= TTL_MS) {
    const slice = limit != null ? cache.shops.slice(0, limit) : cache.shops;
    return { data: slice, error: null };
  }

  const result = await getPopularShops(limit);
  if (result.error) {
    return { data: [], error: result.error };
  }
  const shops = result.data ?? [];
  cache = { shops, savedAt: Date.now() };
  return { data: shops, error: null };
}

export function invalidatePopularShopsCache(): void {
  cache = null;
}
