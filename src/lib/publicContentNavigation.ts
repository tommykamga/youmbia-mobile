/** Resource identity ignores attribution, but preserves the listing contact intent. */
export function getPublicContentNavigationKey(target: string): string {
  const url = new URL(target, 'https://app.youmbia.local');
  const contact = url.pathname.startsWith('/listing/') ? url.searchParams.get('contact') : null;
  return `${url.pathname}${contact ? `?contact=${encodeURIComponent(contact)}` : ''}`;
}

/** Suppress simultaneous initial-URL/listener dispatches without blocking later reopening. */
export function createPublicContentNavigationGuard(now: () => number = Date.now) {
  let pending: { key: string; at: number } | null = null;
  let current = '';
  return {
    observeRoute(pathname: string, params: Record<string, unknown> = {}) {
      const rawContact = Array.isArray(params.contact) ? params.contact[0] : params.contact;
      const contact = typeof rawContact === 'string' ? rawContact : '';
      current = getPublicContentNavigationKey(`${pathname}${contact ? `?contact=${encodeURIComponent(contact)}` : ''}`);
      if (pending?.key === current) pending = null;
    },
    reserve(target: string): boolean {
      const key = getPublicContentNavigationKey(target);
      if (current === key) return false;
      if (pending?.key === key && now() - pending.at < 1500) return false;
      pending = { key, at: now() };
      return true;
    },
  };
}
