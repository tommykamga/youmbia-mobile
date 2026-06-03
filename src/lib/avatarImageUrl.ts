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

/** Appends a cache-busting `v` query param to a display URL (no-op if version empty). */
export function appendAvatarVersion(displayUrl: string, version?: string | number | null): string {
  const url = String(displayUrl ?? '').trim();
  if (!url) return '';
  const v = String(version ?? '').trim();
  if (!v) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}v=${encodeURIComponent(v)}`;
}

/**
 * Resolves a display URL for an avatar path/url.
 * `version` (e.g. derived from profiles.updated_at) is appended as `?v=` so that, when the
 * underlying image changes at a stable Storage path, every device gets a fresh URI and reloads.
 */
export async function resolveSingleAvatarUrl(
  urlOrPath: string,
  version?: string | number | null
): Promise<string> {
  const s = String(urlOrPath ?? '').trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return appendAvatarVersion(s, version);
  const map = await getSignedAvatarUrlsMap([s]);
  const display = toDisplayAvatarUrl(s, map);
  return appendAvatarVersion(display, version);
}

/**
 * Résout plusieurs avatars en batch (inbox, listes vendeurs).
 * Clé = chemin Storage brut ; valeur = URL affichable avec cache-bust.
 */
export async function resolveAvatarDisplayUrls(
  entries: Array<{ path: string; version?: string | number | null }>
): Promise<Map<string, string>> {
  const paths = entries
    .map((e) => String(e.path ?? '').trim())
    .filter((p) => p !== '' && !/^https?:\/\//i.test(p));
  const signedMap = await getSignedAvatarUrlsMap(paths);
  const out = new Map<string, string>();
  for (const { path, version } of entries) {
    const key = String(path ?? '').trim();
    if (!key) continue;
    if (/^https?:\/\//i.test(key)) {
      out.set(key, appendAvatarVersion(key, version));
      continue;
    }
    const display = toDisplayAvatarUrl(key, signedMap);
    if (display) out.set(key, appendAvatarVersion(display, version));
  }
  return out;
}

/**
 * Invalidates the in-memory signed-URL cache for a given Storage path/url.
 * Used after replacing an avatar at a stable path so the next resolve fetches fresh.
 */
export function invalidateAvatarCache(urlOrPath: string): void {
  const key = cacheKeyForPathOrUrl(urlOrPath);
  if (key) signedUrlMemoryCache.delete(key);
}

/**
 * Resolves a fresh display URL for an avatar that was just (re)uploaded at a stable path.
 * Busts the memory cache and appends a version (DB `updated_at` when available, else a local
 * timestamp) so `expo-image` reloads the new bytes instead of serving the cached image.
 */
export async function resolveFreshAvatarUrl(
  urlOrPath: string,
  version?: string | number | null
): Promise<string> {
  const s = String(urlOrPath ?? '').trim();
  if (!s) return '';
  invalidateAvatarCache(s);
  const v = String(version ?? '').trim() || String(Date.now());
  return resolveSingleAvatarUrl(s, v);
}

