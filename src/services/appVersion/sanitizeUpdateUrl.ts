import type { AppVersionPlatform } from './getAppVersionStatus';

/** Hôtes exacts, jamais de includes() sur l'URL brute (anti-domain spoofing). */
const STORE_HOSTS: Record<AppVersionPlatform, ReadonlySet<string>> = {
  ios: new Set(['apps.apple.com', 'itunes.apple.com']),
  android: new Set([
    'play.google.com',
    'galaxystore.samsung.com',
    'appgallery.huawei.com',
    'appgallery.cloud.huawei.com',
  ]),
};

/** Ne conserve que les URLs d'un store reconnu pour le système visé. */
export function sanitizeUpdateUrl(
  platform: AppVersionPlatform,
  rawUrl: string | null | undefined
): string | null {
  const value = rawUrl?.trim();
  if (!value) return null;

  try {
    const url = new URL(value);
    if (url.username || url.password || url.port) return null;

    if (platform === 'android' && url.protocol === 'market:') {
      return url.hostname === 'details' &&
        url.pathname === '' &&
        url.searchParams.get('id') === 'com.youmbia.mobile'
        ? value
        : null;
    }

    if (url.protocol !== 'https:') return null;
    if (!STORE_HOSTS[platform].has(url.hostname.toLowerCase())) return null;
    return value;
  } catch {
    return null;
  }
}
