import { getPublicContentHref } from './publicContentDeepLink';

/** Same validated contract as native entry: slug/legacy UUID and attribution preserved. */
export function getShopHrefFromUrl(rawUrl: string | null | undefined): string | null {
  const href = getPublicContentHref(rawUrl);
  return href?.startsWith('/shop/') ? href : null;
}
