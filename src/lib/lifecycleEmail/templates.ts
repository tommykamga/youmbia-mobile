/**
 * Templates HTML FR brandés YOUMBIA — canal service ou marketing selon campagne.
 * Rendu : `renderLifecycleEmail.ts` (miroir Edge `_shared/lifecycleTemplates.ts`).
 */

import { type LifecycleCampaignId } from './campaigns';
import type { LifecycleCta } from './cta';
import {
  assertLifecycleCategoryAllowed,
  buildLifecycleProviderHeaders,
  buildLifecycleResendTags,
  resolveLifecycleEmailCategory,
  type LifecycleEmailCategory,
} from './emailCategory';
import {
  lifecycleCampaignPreheader,
  lifecycleCampaignSubject,
  renderLifecycleEmailHtml as renderHtmlCore,
  renderLifecycleEmailText as renderTextCore,
  resolveLifecycleRenderCta,
  type LifecycleDiscoveryListing,
  type LifecycleRenderInput,
} from './renderLifecycleEmail';

export type LifecycleTemplateInput = {
  campaignId: LifecycleCampaignId;
  fullName?: string | null;
  cta: LifecycleCta;
  unsubscribeUrl: string;
  draftRemindersOptOutUrl?: string | null;
  listingTitle?: string | null;
  listingCity?: string | null;
  discoveryListings?: LifecycleDiscoveryListing[] | null;
  webFallbackUrl?: string | null;
};

export type LifecycleRenderedEmail = {
  category: LifecycleEmailCategory;
  campaignId: LifecycleCampaignId;
  subject: string;
  preheader: string;
  html: string;
  text: string;
  headers: Record<string, string>;
  tags: { name: string; value: string }[];
};

function toRenderInput(input: LifecycleTemplateInput): LifecycleRenderInput {
  return {
    campaignId: input.campaignId,
    fullName: input.fullName,
    cta: {
      href: input.cta.href,
      label: input.cta.label,
      enabled: input.cta.enabled,
    },
    unsubscribeUrl: input.unsubscribeUrl,
    draftRemindersOptOutUrl: input.draftRemindersOptOutUrl,
    listingTitle: input.listingTitle,
    listingCity: input.listingCity,
    discoveryListings: input.discoveryListings,
    webFallbackUrl: input.webFallbackUrl,
  };
}

export function renderLifecycleEmailHtml(input: LifecycleTemplateInput): string {
  const category = resolveLifecycleEmailCategory(input.campaignId);
  assertLifecycleCategoryAllowed(category);
  return renderHtmlCore(toRenderInput(input));
}

export function renderLifecycleEmailText(input: LifecycleTemplateInput): string {
  const category = resolveLifecycleEmailCategory(input.campaignId);
  assertLifecycleCategoryAllowed(category);
  return renderTextCore(toRenderInput(input));
}

/** Package complet prêt pour le worker (mocks / Resend). */
export function buildLifecycleRenderedEmail(args: {
  campaignId: LifecycleCampaignId;
  fullName?: string | null;
  unsubscribeUrl: string;
  draftRemindersOptOutUrl?: string | null;
  listingTitle?: string | null;
  listingCity?: string | null;
  discoveryListings?: LifecycleDiscoveryListing[] | null;
  listingId?: string | null;
  dryRun?: boolean;
}): LifecycleRenderedEmail {
  const route = resolveLifecycleRenderCta(args.campaignId, {
    dryRun: args.dryRun,
    listingId: args.listingId,
  });
  const cta: LifecycleCta = {
    href: route.href,
    label: route.label,
    enabled: route.enabled,
    reasonDisabled: route.enabled ? undefined : 'cta_path_unverified_or_dry_run',
  };
  const input: LifecycleTemplateInput = {
    campaignId: args.campaignId,
    fullName: args.fullName,
    cta,
    unsubscribeUrl: args.unsubscribeUrl,
    draftRemindersOptOutUrl: args.draftRemindersOptOutUrl,
    listingTitle: args.listingTitle,
    listingCity: args.listingCity,
    discoveryListings: args.discoveryListings,
    webFallbackUrl: route.webFallbackUrl,
  };
  const category = resolveLifecycleEmailCategory(args.campaignId);
  return {
    category,
    campaignId: args.campaignId,
    subject: lifecycleCampaignSubject(args.campaignId),
    preheader: lifecycleCampaignPreheader(args.campaignId),
    html: renderLifecycleEmailHtml(input),
    text: renderLifecycleEmailText(input),
    headers: buildLifecycleProviderHeaders(args.unsubscribeUrl, category),
    tags: buildLifecycleResendTags(args.campaignId),
  };
}
