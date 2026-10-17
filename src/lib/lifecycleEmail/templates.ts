/**
 * Templates HTML FR brandés YOUMBIA — catégorie marketing uniquement.
 * Rendu : `renderLifecycleEmail.ts` (miroir Edge `_shared/lifecycleTemplates.ts`).
 */

import { type LifecycleCampaignId } from './campaigns';
import type { LifecycleCta } from './cta';
import {
  assertLifecycleIsMarketing,
  buildLifecycleProviderHeaders,
  buildLifecycleResendTags,
  LIFECYCLE_EMAIL_CATEGORY,
} from './emailCategory';
import {
  lifecycleCampaignPreheader,
  lifecycleCampaignSubject,
  renderLifecycleEmailHtml as renderHtmlCore,
  renderLifecycleEmailText as renderTextCore,
  resolveLifecycleRenderCta,
  type LifecycleRenderInput,
} from './renderLifecycleEmail';

export type LifecycleTemplateInput = {
  campaignId: LifecycleCampaignId;
  fullName?: string | null;
  cta: LifecycleCta;
  unsubscribeUrl: string;
  listingTitle?: string | null;
  webFallbackUrl?: string | null;
};

export type LifecycleRenderedEmail = {
  category: typeof LIFECYCLE_EMAIL_CATEGORY;
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
    listingTitle: input.listingTitle,
    webFallbackUrl: input.webFallbackUrl,
  };
}

export function renderLifecycleEmailHtml(input: LifecycleTemplateInput): string {
  assertLifecycleIsMarketing(LIFECYCLE_EMAIL_CATEGORY);
  return renderHtmlCore(toRenderInput(input));
}

export function renderLifecycleEmailText(input: LifecycleTemplateInput): string {
  assertLifecycleIsMarketing(LIFECYCLE_EMAIL_CATEGORY);
  return renderTextCore(toRenderInput(input));
}

/** Package complet prêt pour le worker (mocks / Resend marketing). */
export function buildLifecycleRenderedEmail(args: {
  campaignId: LifecycleCampaignId;
  fullName?: string | null;
  unsubscribeUrl: string;
  listingTitle?: string | null;
  listingId?: string | null;
  dryRun?: boolean;
}): LifecycleRenderedEmail {
  void args.listingId; // reprise brouillon = app ; pas d’URL publique draft
  const route = resolveLifecycleRenderCta(args.campaignId, { dryRun: args.dryRun });
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
    listingTitle: args.listingTitle,
    webFallbackUrl: route.webFallbackUrl,
  };
  return {
    category: LIFECYCLE_EMAIL_CATEGORY,
    campaignId: args.campaignId,
    subject: lifecycleCampaignSubject(args.campaignId),
    preheader: lifecycleCampaignPreheader(args.campaignId),
    html: renderLifecycleEmailHtml(input),
    text: renderLifecycleEmailText(input),
    headers: buildLifecycleProviderHeaders(args.unsubscribeUrl),
    tags: buildLifecycleResendTags(args.campaignId),
  };
}
