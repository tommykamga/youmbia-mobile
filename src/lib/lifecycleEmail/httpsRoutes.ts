/**
 * Routes HTTPS lifecycle — web primaire + fallback ; App Links si chemin vérifié.
 * Scheme mobile : youmbiamobile (app.json). Ne pas confondre avec Auth /auth/confirm.
 */

import type { LifecycleCampaignId } from './campaigns';

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

function homeHttps(): string {
  return `${YOUMBIA_WEB_ORIGIN}/`;
}

function mobileHomeScheme(): string {
  return `${YOUMBIA_MOBILE_SCHEME}://home`;
}

export function resolveLifecycleHttpsRoute(
  campaignId: LifecycleCampaignId,
  options?: { dryRun?: boolean; listingId?: string | null }
): LifecycleHttpsRoute {
  const dryRun = options?.dryRun === true;
  const listingId = options?.listingId?.trim() || null;
  const webHome = homeHttps();

  if (campaignId === 'welcome_h0') {
    return {
      campaignId,
      httpsUrl: webHome,
      opensInAppViaHttps: isVerifiedCtaHref(webHome),
      webFallbackUrl: webHome,
      mobileSchemeUrl: mobileHomeScheme(),
      ctaEnabled: true,
    };
  }

  if (campaignId === 'first_listing_h24') {
    if (dryRun) {
      return {
        campaignId,
        httpsUrl: webHome,
        opensInAppViaHttps: false,
        webFallbackUrl: webHome,
        mobileSchemeUrl: `${YOUMBIA_MOBILE_SCHEME}://sell`,
        ctaEnabled: false,
        reasonDisabled: 'cta_path_unverified_for_sell',
      };
    }
    return {
      campaignId,
      httpsUrl: webHome,
      opensInAppViaHttps: isVerifiedCtaHref(webHome),
      webFallbackUrl: webHome,
      mobileSchemeUrl: `${YOUMBIA_MOBILE_SCHEME}://sell`,
      ctaEnabled: true,
    };
  }

  if (listingId) {
    const annonceUrl = `${YOUMBIA_WEB_ORIGIN}/annonce/${encodeURIComponent(listingId)}`;
    if (isVerifiedCtaHref(annonceUrl) && !dryRun) {
      return {
        campaignId,
        httpsUrl: annonceUrl,
        opensInAppViaHttps: true,
        webFallbackUrl: annonceUrl,
        mobileSchemeUrl: `${YOUMBIA_MOBILE_SCHEME}://annonce/${listingId}`,
        ctaEnabled: true,
      };
    }
  }

  if (dryRun) {
    return {
      campaignId,
      httpsUrl: webHome,
      opensInAppViaHttps: false,
      webFallbackUrl: webHome,
      mobileSchemeUrl: mobileHomeScheme(),
      ctaEnabled: false,
      reasonDisabled: 'cta_path_unverified_for_draft_edit',
    };
  }

  return {
    campaignId,
    httpsUrl: webHome,
    opensInAppViaHttps: isVerifiedCtaHref(webHome),
    webFallbackUrl: webHome,
    mobileSchemeUrl: mobileHomeScheme(),
    ctaEnabled: true,
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
