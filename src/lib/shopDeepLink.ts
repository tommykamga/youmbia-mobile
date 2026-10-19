/**
 * Pont HTTPS/Universal Links vers la route boutique Expo Router.
 * Accepte les anciens liens Web basés sur owner_id et les liens par slug.
 * Ne redirige jamais un domaine externe ni une URL non HTTPS.
 */
const PUBLIC_HOSTS = new Set(['www.youmbia.com', 'youmbia.com']);
const SHOP_SEGMENT_PATTERN = /^[a-zA-Z0-9-]+$/;

function shopSegment(pathname: string): string | null {
  const match = pathname.match(/^\/shop\/([^/?#]+)\/?$/i);
  if (!match) return null;
  let candidate: string;
  try {
    candidate = decodeURIComponent(match[1]).trim().toLowerCase();
  } catch {
    return null;
  }
  return SHOP_SEGMENT_PATTERN.test(candidate) ? candidate : null;
}

export function getShopHrefFromUrl(rawUrl: string | null | undefined): string | null {
  const raw = String(rawUrl ?? '').trim();
  if (!raw) return null;

  try {
    const url = new URL(raw);
    if (url.protocol === 'https:' && PUBLIC_HOSTS.has(url.hostname.toLowerCase())) {
      const segment = shopSegment(url.pathname);
      return segment ? `/shop/${segment}` : null;
    }

    if (url.protocol === 'youmbiamobile:') {
      const path = url.hostname.toLowerCase() === 'shop'
        ? `/shop${url.pathname}`
        : url.pathname;
      const segment = shopSegment(path);
      return segment ? `/shop/${segment}` : null;
    }
  } catch {
    return null;
  }

  return null;
}
