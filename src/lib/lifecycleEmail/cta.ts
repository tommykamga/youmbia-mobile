/**
 * CTA HTTPS lifecycle — façade sur httpsRoutes.
 */

import type { LifecycleCampaignId } from './campaigns';
import {
  isVerifiedCtaHref,
  isVerifiedUniversalLinkPath,
  resolveLifecycleHttpsRoute,
  VERIFIED_UNIVERSAL_LINK_PREFIXES,
  YOUMBIA_WEB_ORIGIN,
} from './httpsRoutes';

export {
  isVerifiedCtaHref,
  isVerifiedUniversalLinkPath,
  VERIFIED_UNIVERSAL_LINK_PREFIXES,
  YOUMBIA_WEB_ORIGIN,
};

export type LifecycleCta = {
  href: string | null;
  label: string;
  enabled: boolean;
  reasonDisabled?: string;
};

function labelFor(campaignId: LifecycleCampaignId): string {
  if (campaignId === 'welcome_h0') return 'Découvrir YOUMBIA';
  if (campaignId === 'first_listing_h24') return 'Publier une annonce';
  return 'Ouvrir YOUMBIA';
}

export function resolveCampaignCta(
  campaignId: LifecycleCampaignId,
  options?: { dryRun?: boolean; listingId?: string | null }
): LifecycleCta {
  const route = resolveLifecycleHttpsRoute(campaignId, options);
  return {
    href: route.ctaEnabled ? route.httpsUrl : null,
    label: labelFor(campaignId),
    enabled: route.ctaEnabled,
    reasonDisabled: route.reasonDisabled,
  };
}

export function assertCtaPathAllowlisted(href: string): boolean {
  return isVerifiedCtaHref(href);
}
