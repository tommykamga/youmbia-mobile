/**
 * CTA HTTPS lifecycle — façade sur renderLifecycleEmail + httpsRoutes.
 */

import type { LifecycleCampaignId } from './campaigns';
import {
  isVerifiedCtaHref,
  isVerifiedUniversalLinkPath,
  VERIFIED_UNIVERSAL_LINK_PREFIXES,
  YOUMBIA_WEB_ORIGIN,
} from './httpsRoutes';
import {
  lifecycleCtaLabel,
  resolveLifecycleRenderCta,
} from './renderLifecycleEmail';

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

export function resolveCampaignCta(
  campaignId: LifecycleCampaignId,
  options?: { dryRun?: boolean; listingId?: string | null }
): LifecycleCta {
  void options?.listingId;
  const route = resolveLifecycleRenderCta(campaignId, { dryRun: options?.dryRun });
  return {
    href: route.href,
    label: route.label || lifecycleCtaLabel(campaignId),
    enabled: route.enabled,
    reasonDisabled: route.enabled ? undefined : 'cta_path_unverified_or_dry_run',
  };
}

export function assertCtaPathAllowlisted(href: string): boolean {
  return isVerifiedCtaHref(href);
}
