const WEB_HOSTS = new Set(['www.youmbia.com', 'youmbia.com']);
const LISTING_ID_PATTERN = /^[A-Za-z0-9-]+$/;

function normalizeListingId(value: string | null | undefined): string | null {
  const decoded = decodeURIComponent(String(value ?? '')).trim();
  if (!decoded) return null;
  if (!LISTING_ID_PATTERN.test(decoded)) return null;
  return decoded;
}

function getListingIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/annonce\/([^/?#]+)\/?$/i);
  return normalizeListingId(match?.[1] ?? null);
}

export function getListingHrefFromUrl(url: string | null | undefined): string | null {
  const raw = String(url ?? '').trim();
  if (!raw) return null;

  try {
    const parsed = new URL(raw);

    if (WEB_HOSTS.has(parsed.hostname)) {
      if (!parsed.pathname.toLowerCase().startsWith('/annonce')) return null;
      const listingId = getListingIdFromPath(parsed.pathname);
      return listingId ? `/listing/${listingId}` : '/(tabs)/home';
    }

    if (parsed.protocol === 'youmbiamobile:') {
      const isHostFormat = parsed.hostname.toLowerCase() === 'annonce';
      const isPathFormat = parsed.pathname.toLowerCase().startsWith('/annonce/');
      if (!isHostFormat && !isPathFormat) return null;

      const hostId = isHostFormat ? normalizeListingId(parsed.pathname.slice(1)) : null;
      if (hostId) return `/listing/${hostId}`;

      const pathId = getListingIdFromPath(parsed.pathname);
      return pathId ? `/listing/${pathId}` : '/(tabs)/home';
    }
  } catch {
    return raw.toLowerCase().includes('annonce') ? '/(tabs)/home' : null;
  }

  return null;
}
