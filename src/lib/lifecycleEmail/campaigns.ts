/**
 * Contrats campagnes Lifecycle Email P0 (miroir SQL enqueue).
 * Hypothèses documentées dans docs/LIFECYCLE_EMAIL_P0.md (H1–H5).
 */

export const LIFECYCLE_CAMPAIGN_IDS = [
  'welcome_h0',
  'first_listing_h24',
  'abandoned_draft_h24',
] as const;

export type LifecycleCampaignId = (typeof LIFECYCLE_CAMPAIGN_IDS)[number];

export const LIFECYCLE_FREQUENCY_CAP_MS = 7 * 24 * 60 * 60 * 1000;
export const LIFECYCLE_DRAFT_ABANDON_MS = 24 * 60 * 60 * 1000;
export const LIFECYCLE_FIRST_LISTING_DELAY_MS = 24 * 60 * 60 * 1000;
export const LIFECYCLE_CLAIM_STALE_MS = 10 * 60 * 1000;
export const LIFECYCLE_MAX_SEND_ATTEMPTS = 5;

export type LifecycleOutboxStatus =
  | 'pending'
  | 'processing'
  | 'sent'
  | 'failed'
  | 'skipped'
  | 'cancelled'
  | 'uncertain';

export type LifecycleEmailPreferences = {
  marketing_opt_in: boolean;
  unsubscribed_at: string | null;
};

export type LifecycleEligibilityInput = {
  preferences: LifecycleEmailPreferences | null;
  isBanned: boolean;
  email: string | null;
  suppressed: boolean;
  killSwitch: boolean;
  hasSentWithinFrequencyCap: boolean;
  accountCreatedAtMs: number;
  hasEverPublishedListing: boolean;
  draft?: {
    listingId: string;
    status: string;
    updatedAtMs: number;
    lastPublishedAt: string | null;
  } | null;
  nowMs: number;
};

export function hasValidMarketingConsent(
  preferences: LifecycleEmailPreferences | null
): boolean {
  if (!preferences) return false;
  if (preferences.unsubscribed_at != null) return false;
  return preferences.marketing_opt_in === true;
}

export function isEligibleCommon(input: LifecycleEligibilityInput): {
  ok: boolean;
  reason?: string;
} {
  if (input.killSwitch) return { ok: false, reason: 'kill_switch' };
  if (!hasValidMarketingConsent(input.preferences)) {
    return { ok: false, reason: 'no_consent' };
  }
  if (input.isBanned) return { ok: false, reason: 'banned' };
  const email = String(input.email ?? '').trim();
  if (!email) return { ok: false, reason: 'no_email' };
  if (input.suppressed) return { ok: false, reason: 'suppressed' };
  if (input.hasSentWithinFrequencyCap) {
    return { ok: false, reason: 'frequency_cap' };
  }
  return { ok: true };
}

export function isEligibleWelcome(input: LifecycleEligibilityInput): {
  ok: boolean;
  reason?: string;
} {
  return isEligibleCommon(input);
}

export function isEligibleFirstListing(input: LifecycleEligibilityInput): {
  ok: boolean;
  reason?: string;
} {
  const common = isEligibleCommon(input);
  if (!common.ok) return common;
  if (input.nowMs - input.accountCreatedAtMs < LIFECYCLE_FIRST_LISTING_DELAY_MS) {
    return { ok: false, reason: 'too_early' };
  }
  if (input.hasEverPublishedListing) {
    return { ok: false, reason: 'already_published' };
  }
  return { ok: true };
}

export function isEligibleAbandonedDraft(input: LifecycleEligibilityInput): {
  ok: boolean;
  reason?: string;
} {
  const common = isEligibleCommon(input);
  if (!common.ok) return common;
  const draft = input.draft;
  if (!draft) return { ok: false, reason: 'draft_not_eligible' };
  if (draft.status !== 'draft') return { ok: false, reason: 'draft_not_eligible' };
  if (draft.lastPublishedAt != null) {
    return { ok: false, reason: 'draft_not_eligible' };
  }
  if (input.nowMs - draft.updatedAtMs < LIFECYCLE_DRAFT_ABANDON_MS) {
    return { ok: false, reason: 'too_early' };
  }
  return { ok: true };
}

export function campaignSubject(campaignId: LifecycleCampaignId): string {
  switch (campaignId) {
    case 'welcome_h0':
      return 'Bienvenue sur YOUMBIA';
    case 'first_listing_h24':
      return 'Publiez votre première annonce sur YOUMBIA';
    case 'abandoned_draft_h24':
      return 'Votre brouillon vous attend sur YOUMBIA';
    default: {
      const _exhaustive: never = campaignId;
      return _exhaustive;
    }
  }
}
