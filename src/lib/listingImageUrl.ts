/**
 * Listing image URL normalization for mobile.
 * Aligné Youmbia-web : chemins bucket + signed URLs ; préférence `thumb_path` / `medium_path` en liste
 * pour réduire egress Storage ; cache mémoire court des signed URLs.
 */

import { supabase } from '@/lib/supabase';

/** Bucket name – must match web app (Youmbia-web uses 'listing-images'). */
const LISTING_IMAGES_BUCKET = 'listing-images';

const SIGNED_URL_EXPIRES_IN = 60 * 60; // 1 hour, same as web
/**
 * Cache mémoire session : clé = chemin bucket ou URL publique, valeur = URL affichable (signée ou identique).
 * TTL légèrement inférieure à la durée du token signé pour éviter de servir une URL expirée.
 */
const SIGNED_URL_MEMORY_TTL_MS = Math.max(60_000, SIGNED_URL_EXPIRES_IN * 1000 - 120_000);

const signedUrlMemoryCache = new Map<string, { signedUrl: string; expiresAt: number }>();

function cacheKeyForPathOrUrl(s: string): string {
  return String(s ?? '').trim();
}

export type ListingImageRowForCard = {
  url: string;
  sort_order: number | null;
  thumb_path?: string | null;
  medium_path?: string | null;
};

/**
 * Chemin à résoudre pour une ligne image (vignette d’abord, sans changement de schéma).
 */
export function pickListingImageStoragePath(img: {
  url?: string | null;
  thumb_path?: string | null;
  medium_path?: string | null;
}): string {
  for (const c of [img.thumb_path, img.medium_path, img.url]) {
    const s = String(c ?? '').trim();
    if (s) return s;
  }
  return '';
}

/**
 * Chemins bucket à passer à `createSignedUrls` — **première** image carte (hors http seul).
 */
export function listingStoragePathsForCardCover(
  rows: ListingImageRowForCard[] | null | undefined,
  maxStoragePaths = 1
): string[] {
  const sorted = [...(rows ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  for (const img of sorted) {
    const p = pickListingImageStoragePath(img);
    if (!p) continue;
    if (/^https?:\/\//i.test(p)) return [];
    return maxStoragePaths <= 0 ? [p] : [p];
  }
  return [];
}

/**
 * URLs affichables pour une carte liste : **une** image (vignette si dispo).
 */
export function mapListingCardImages(
  rows: ListingImageRowForCard[] | null | undefined,
  signedMap: Map<string, string>
): string[] {
  const sorted = [...(rows ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const first = sorted[0];
  if (!first) return [];
  const p = pickListingImageStoragePath(first);
  const u = toDisplayImageUrl(p, signedMap);
  return u ? [u] : [];
}

/**
 * Returns a Map from storage path to signed URL.
 * Call once per request with all paths, then use map.get(path) when mapping listing_images.
 */
export async function getSignedUrlsMap(paths: string[]): Promise<Map<string, string>> {
  const trimmed = paths
    .map((p) => String(p ?? '').trim())
    .filter((p) => p !== '' && !/^https?:\/\//i.test(p));
  if (trimmed.length === 0) return new Map();

  const now = Date.now();
  const map = new Map<string, string>();
  const needFetch: string[] = [];
  for (const p of trimmed) {
    const key = cacheKeyForPathOrUrl(p);
    if (!key) continue;
    const hit = signedUrlMemoryCache.get(key);
    if (hit && hit.expiresAt > now) {
      map.set(key, hit.signedUrl);
    } else {
      needFetch.push(key);
    }
  }
  const uniqueNeedFetch = [...new Set(needFetch)];
  if (uniqueNeedFetch.length === 0) return map;

  const { data, error } = await supabase.storage
    .from(LISTING_IMAGES_BUCKET)
    .createSignedUrls(uniqueNeedFetch, SIGNED_URL_EXPIRES_IN);

  if (error || !data) return map;
  for (const item of data) {
    if (item.path != null && item.signedUrl && item.error == null) {
      const key = cacheKeyForPathOrUrl(String(item.path));
      if (!key) continue;
      map.set(key, item.signedUrl);
      signedUrlMemoryCache.set(key, {
        signedUrl: item.signedUrl,
        expiresAt: now + SIGNED_URL_MEMORY_TTL_MS,
      });
    }
  }
  return map;
}

/**
 * Single-value helper: if value is already http(s), return as-is; otherwise it's a path
 * (caller should prefer batch getSignedUrlsMap when mapping multiple images).
 */
export function toDisplayImageUrl(urlOrPath: string, signedMap?: Map<string, string>): string {
  const s = cacheKeyForPathOrUrl(urlOrPath);
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  const now = Date.now();
  const mem = signedUrlMemoryCache.get(s);
  if (mem && mem.expiresAt > now) {
    return mem.signedUrl;
  }
  if (signedMap) {
    const signed = signedMap.get(s);
    if (signed) return signed;
  }
  return '';
}

/**
 * Résout une seule image (sign Storage ou URL absolue). Pour lazy-load galerie fiche sans batch initial.
 */
export async function resolveSingleListingImageUrl(urlOrPath: string): Promise<string> {
  const s = String(urlOrPath ?? '').trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  const map = await getSignedUrlsMap([s]);
  return toDisplayImageUrl(s, map);
}
