/**
 * CTA HTTPS lifecycle — allowlist Universal Links YOUMBIA (web config).
 * Chemins non vérifiés → CTA désactivé en mode test/dry-run (H4).
 */

import type { LifecycleCampaignId } from './campaigns';

/** Aligné Youmbia-web lib/mobileAppConfig YOUMBIA_UNIVERSAL_LINK_PATH_PREFIXES. */
export const VERIFIED_UNIVERSAL_LINK_PREFIXES = [
  '/',
  '/annonce/',
  '/shop/',
  '/seller/',
  '/c/',
  '/ville/',
  '/recherche',
] as const;

export const YOUMBIA_WEB_ORIGIN = 'https://www.youmbia.com';

export type LifecycleCta = {
  href: string | null;
  label: string;
  enabled: boolean;
  reasonDisabled?: string;
};

function pathOf(href: string): string {
  try {
    const u = new URL(href);
    return u.pathname || '/';
  } catch {
    return '';
  }
}

export function isVerifiedUniversalLinkPath(pathname: string): boolean {
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`;
  if (path === '/') return true;
  return VERIFIED_UNIVERSAL_LINK_PREFIXES.some((prefix) => {
    if (prefix === '/') return false;
    if (prefix.endsWith('/')) return path === prefix.slice(0, -1) || path.startsWith(prefix);
    return path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(prefix);
  });
}

export function isVerifiedCtaHref(href: string | null | undefined): boolean {
  if (!href) return false;
  try {
    const u = new URL(href);
    if (u.protocol !== 'https:') return false;
    if (u.hostname !== 'www.youmbia.com' && u.hostname !== 'youmbia.com') return false;
    return isVerifiedUniversalLinkPath(u.pathname);
  } catch {
    return false;
  }
}

/**
 * @param dryRun — si true, CTA non vérifié → enabled false (tests d’envoi).
 */
export function resolveCampaignCta(
  campaignId: LifecycleCampaignId,
  options?: { dryRun?: boolean; listingId?: string | null }
): LifecycleCta {
  const dryRun = options?.dryRun === true;

  if (campaignId === 'welcome_h0') {
    const href = `${YOUMBIA_WEB_ORIGIN}/`;
    return {
      href,
      label: 'Découvrir YOUMBIA',
      enabled: true,
    };
  }

  if (campaignId === 'first_listing_h24') {
    // Pas de préfixe sell vérifié dans AASA → web fallback home en prod soft,
    // CTA désactivé en dry-run/test send (H4).
    const href = `${YOUMBIA_WEB_ORIGIN}/`;
    if (dryRun) {
      return {
        href: null,
        label: 'Publier une annonce',
        enabled: false,
        reasonDisabled: 'cta_path_unverified_for_sell',
      };
    }
    return {
      href,
      label: 'Publier une annonce',
      enabled: isVerifiedCtaHref(href),
      reasonDisabled: isVerifiedCtaHref(href) ? undefined : 'cta_path_unverified',
    };
  }

  // abandoned_draft_h24 — édition draft hors Universal Links vérifiés
  const listingId = options?.listingId?.trim() || null;
  if (listingId && isVerifiedCtaHref(`${YOUMBIA_WEB_ORIGIN}/annonce/${listingId}`)) {
    const href = `${YOUMBIA_WEB_ORIGIN}/annonce/${listingId}`;
    return { href, label: 'Reprendre mon annonce', enabled: true };
  }

  if (dryRun) {
    return {
      href: null,
      label: 'Reprendre mon brouillon',
      enabled: false,
      reasonDisabled: 'cta_path_unverified_for_draft_edit',
    };
  }

  const fallback = `${YOUMBIA_WEB_ORIGIN}/`;
  return {
    href: fallback,
    label: 'Ouvrir YOUMBIA',
    enabled: true,
  };
}

export function assertCtaPathAllowlisted(href: string): boolean {
  return isVerifiedCtaHref(href) && pathOf(href).length > 0;
}
