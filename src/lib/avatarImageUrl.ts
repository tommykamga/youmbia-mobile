/**
 * Avatar URL normalization for mobile.
 * Strategy: `profiles.avatar_url` can be either a full http(s) URL or a Storage path.
 * We resolve Storage paths via signed URLs (safe default).
 *
 * Bucket name is a convention; if your Supabase project uses another bucket,
 * update `AVATARS_BUCKET` (do NOT auto-create buckets client-side).
 */

import { supabase } from '@/lib/supabase';

/**
 * Bucket to use for avatars.
 * - Prefer `EXPO_PUBLIC_AVATARS_BUCKET` if set.
 * - Fallback to `listing-images` (known existing bucket in this codebase) to avoid blocking the feature
 *   when a dedicated avatars bucket isn't created yet.
 *
 * This does NOT create buckets; it only selects which existing bucket to use.
 */
export const AVATARS_BUCKET =
  (process.env.EXPO_PUBLIC_AVATARS_BUCKET ?? '').trim() || 'listing-images';

const SIGNED_URL_EXPIRES_IN = 60 * 60; // 1 hour
const SIGNED_URL_MEMORY_TTL_MS = Math.max(60_000, SIGNED_URL_EXPIRES_IN * 1000 - 120_000);

const signedUrlMemoryCache = new Map<string, { signedUrl: string; expiresAt: number }>();

function cacheKeyForPathOrUrl(s: string): string {
  return String(s ?? '').trim();
}

export function toDisplayAvatarUrl(urlOrPath: string, signedMap?: Map<string, string>): string {
  const s = cacheKeyForPathOrUrl(urlOrPath);
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  const now = Date.now();
  const mem = signedUrlMemoryCache.get(s);
  if (mem && mem.expiresAt > now) return mem.signedUrl;
  if (signedMap) {
    const signed = signedMap.get(s);
    if (signed) return signed;
  }
  return '';
}

export async function getSignedAvatarUrlsMap(paths: string[]): Promise<Map<string, string>> {
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
    .from(AVATARS_BUCKET)
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

export async function resolveSingleAvatarUrl(urlOrPath: string): Promise<string> {
  const s = String(urlOrPath ?? '').trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  const map = await getSignedAvatarUrlsMap([s]);
  return toDisplayAvatarUrl(s, map);
}

