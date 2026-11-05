import {
  getSignedUrlsMap,
  isListingImageHttpUrl,
  toDisplayImageUrl,
} from '@/lib/listingImageUrl';
import type { PublicShop } from '@/types/shops';

function shopMediaPaths(shop: PublicShop): string[] {
  const paths: string[] = [];
  for (const value of [shop.logo_url, shop.banner_url]) {
    const s = String(value ?? '').trim();
    if (s && !isListingImageHttpUrl(s)) paths.push(s);
  }
  return paths;
}

/** URL utilisable par `<Image source={{ uri }}>` — jamais un path Storage brut. */
export function isDisplayableShopMediaUrl(url: string | null | undefined): boolean {
  const s = String(url ?? '').trim();
  return s !== '' && isListingImageHttpUrl(s);
}

function resolveOneShopMediaField(
  raw: string | null | undefined,
  signedMap: Map<string, string>
): string | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  if (isListingImageHttpUrl(s)) return s;
  return toDisplayImageUrl(s, signedMap) || null;
}

/** Résout logo/bannière (URL absolue ou chemin Storage signé). Ne renvoie jamais de path bucket brut. */
export async function resolveShopMediaUrls(shop: PublicShop): Promise<PublicShop> {
  const paths = shopMediaPaths(shop);
  const signedMap = paths.length > 0 ? await getSignedUrlsMap(paths) : new Map<string, string>();

  return {
    ...shop,
    logo_url: resolveOneShopMediaField(shop.logo_url, signedMap),
    banner_url: resolveOneShopMediaField(shop.banner_url, signedMap),
  };
}

export async function resolveShopsMediaUrls(shops: PublicShop[]): Promise<PublicShop[]> {
  const allPaths = shops.flatMap((s) => shopMediaPaths(s));
  const signedMap = allPaths.length > 0 ? await getSignedUrlsMap(allPaths) : new Map<string, string>();

  return shops.map((shop) => ({
    ...shop,
    logo_url: resolveOneShopMediaField(shop.logo_url, signedMap),
    banner_url: resolveOneShopMediaField(shop.banner_url, signedMap),
  }));
}
