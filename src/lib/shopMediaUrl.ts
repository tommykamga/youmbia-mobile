import { getSignedUrlsMap, toDisplayImageUrl } from '@/lib/listingImageUrl';
import type { PublicShop } from '@/types/shops';

function shopMediaPaths(shop: PublicShop): string[] {
  const paths: string[] = [];
  for (const value of [shop.logo_url, shop.banner_url]) {
    const s = String(value ?? '').trim();
    if (s && !/^https?:\/\//i.test(s)) paths.push(s);
  }
  return paths;
}

/** Résout logo/bannière (URL absolue ou chemin Storage). */
export async function resolveShopMediaUrls(shop: PublicShop): Promise<PublicShop> {
  const paths = shopMediaPaths(shop);
  if (paths.length === 0) return shop;
  const signedMap = await getSignedUrlsMap(paths);
  return {
    ...shop,
    logo_url: shop.logo_url
      ? toDisplayImageUrl(shop.logo_url, signedMap) || shop.logo_url
      : shop.logo_url,
    banner_url: shop.banner_url
      ? toDisplayImageUrl(shop.banner_url, signedMap) || shop.banner_url
      : shop.banner_url,
  };
}

export async function resolveShopsMediaUrls(shops: PublicShop[]): Promise<PublicShop[]> {
  const allPaths = shops.flatMap((s) => shopMediaPaths(s));
  if (allPaths.length === 0) return shops;
  const signedMap = await getSignedUrlsMap(allPaths);
  return shops.map((shop) => ({
    ...shop,
    logo_url: shop.logo_url
      ? toDisplayImageUrl(shop.logo_url, signedMap) || shop.logo_url
      : shop.logo_url,
    banner_url: shop.banner_url
      ? toDisplayImageUrl(shop.banner_url, signedMap) || shop.banner_url
      : shop.banner_url,
  }));
}
