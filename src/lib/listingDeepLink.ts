import { setListingViewSource } from '@/lib/analytics';
import { getPublicContentHref } from './publicContentDeepLink';

export function getListingHrefFromUrl(url: string | null | undefined): string | null {
  const href = getPublicContentHref(url);
  if (!href?.startsWith('/listing/')) return null;
  setListingViewSource(/^https:/i.test(String(url).trim()) ? 'shared' : 'link');
  return href;
}
