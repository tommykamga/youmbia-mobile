import { YOUMBIA_MOBILE_SCHEME } from './appScheme';
/** Pure routing bridge. Auth URLs are deliberately left to the existing auth handler. */
const HOSTS = new Set(['www.youmbia.com', 'youmbia.com']);
export function getPublicContentHref(raw: string | null | undefined, appScheme = YOUMBIA_MOBILE_SCHEME): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.username || url.password || url.port) return null;
    let path = url.pathname;
    if (url.protocol === 'https:') {
      if (!HOSTS.has(url.hostname)) return null;
    } else if (url.protocol === `${appScheme}:`) {
      if (url.hostname) path = `/${url.hostname}${path}`;
    } else return null;
    const match = path.match(/^\/(annonce|seller|vendeur|shop)\/([^/]+)\/?$/i);
    if (!match) return null;
    const segment = decodeURIComponent(match[2]);
    if (!/^[a-zA-Z0-9-]+$/.test(segment)) return null;
    const routeFamily = match[1].toLowerCase();
    const family = routeFamily === 'annonce' ? 'listing' : routeFamily === 'shop' ? 'shop' : 'user';
    const id = family === 'shop' ? segment.toLowerCase() : segment;
    return `/${family}/${id}${url.search}${url.hash}`;
  } catch { return null; }
}
