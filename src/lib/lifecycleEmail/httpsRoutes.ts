/**
 * Routes HTTPS lifecycle — web primaire + fallback.
 * Scheme mobile youmbiamobile hors HTML email.
 *
 * CTA brouillon : jamais /annonce/{id} (page publique ≠ éditeur /sell?draftId=).
 */

import type { LifecycleCampaignId } from './campaigns';
import { resolveLifecycleRenderCta } from './renderLifecycleEmail';

export const YOUMBIA_WEB_ORIGIN = 'https://www.youmbia.com';
export const YOUMBIA_MOBILE_SCHEME = 'youmbiamobile';

export const VERIFIED_UNIVERSAL_LINK_PREFIXES = [
  '/',
  '/annonce/',
  '/shop/',
  '/seller/',
  '/c/',
  '/ville/',
  '/recherche',
] as const;

export type LifecycleHttpsRoute = {
  campaignId: LifecycleCampaignId;
  httpsUrl: string;
  opensInAppViaHttps: boolean;
  webFallbackUrl: string;
  mobileSchemeUrl: string | null;
  ctaEnabled: boolean;
  reasonDisabled?: string;
};

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

export function resolveLifecycleHttpsRoute(
  campaignId: LifecycleCampaignId,
  options?: { dryRun?: boolean; listingId?: string | null }
): LifecycleHttpsRoute {
  void options?.listingId;
  const cta = resolveLifecycleRenderCta(campaignId, { dryRun: options?.dryRun });
  const home = `${YOUMBIA_WEB_ORIGIN}/`;
  let mobileSchemeUrl: string | null = `${YOUMBIA_MOBILE_SCHEME}://home`;
  if (campaignId === 'first_listing_h24') {
    mobileSchemeUrl = `${YOUMBIA_MOBILE_SCHEME}://sell`;
  } else if (campaignId === 'abandoned_draft_h24') {
    // Reprise réelle = /sell?draftId= dans l’app (pas d’équivalent HTTPS public).
    mobileSchemeUrl = `${YOUMBIA_MOBILE_SCHEME}://sell`;
  }
  return {
    campaignId,
    httpsUrl: cta.href ?? home,
    opensInAppViaHttps: isVerifiedCtaHref(cta.href),
    webFallbackUrl: cta.webFallbackUrl,
    mobileSchemeUrl,
    ctaEnabled: cta.enabled,
    reasonDisabled: cta.enabled ? undefined : 'cta_path_unverified_or_dry_run',
  };
}

export function assertEmailCtaIsHttps(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      u.protocol === 'https:' &&
      (u.hostname === 'www.youmbia.com' || u.hostname === 'youmbia.com')
    );
  } catch {
    return false;
  }
}
