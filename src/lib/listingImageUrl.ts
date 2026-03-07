/**
 * Listing image URL normalization for mobile.
 * Aligned with Youmbia-web: listing_images.url stores storage paths;
 * bucket "listing-images" is private, so we use signed URLs (1h) like the web.
 */

import { supabase } from '@/lib/supabase';

/** Bucket name – must match web app (Youmbia-web uses 'listing-images'). */
const LISTING_IMAGES_BUCKET = 'listing-images';

const SIGNED_URL_EXPIRES_IN = 60 * 60; // 1 hour, same as web

/**
 * Returns a Map from storage path to signed URL.
 * Call once per request with all paths, then use map.get(path) when mapping listing_images.
 */
export async function getSignedUrlsMap(paths: string[]): Promise<Map<string, string>> {
  const trimmed = paths
    .map((p) => String(p ?? '').trim())
    .filter((p) => p !== '' && !/^https?:\/\//i.test(p));
  if (trimmed.length === 0) return new Map();

  const { data, error } = await supabase.storage
    .from(LISTING_IMAGES_BUCKET)
    .createSignedUrls(trimmed, SIGNED_URL_EXPIRES_IN);

  const map = new Map<string, string>();
  if (error || !data) return map;
  for (const item of data) {
    if (item.path != null && item.signedUrl && item.error == null) {
      map.set(item.path, item.signedUrl);
    }
  }
  return map;
}

/**
 * Single-value helper: if value is already http(s), return as-is; otherwise it's a path
 * (caller should prefer batch getSignedUrlsMap when mapping multiple images).
 */
export function toDisplayImageUrl(urlOrPath: string, signedMap?: Map<string, string>): string {
  const s = String(urlOrPath ?? '').trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  if (signedMap) {
    const signed = signedMap.get(s);
    if (signed) return signed;
  }
  return '';
}
