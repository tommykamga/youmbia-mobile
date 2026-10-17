/**
 * Contrats campagnes Lifecycle Email (miroir SQL enqueue / revalidate).
 * Channel : welcome = service ; first_listing + abandoned_draft = marketing.
 */

export const LIFECYCLE_CAMPAIGN_IDS = [
  'welcome_h0',
  'first_listing_h24',
  'abandoned_draft_h24',
] as const;

export type LifecycleCampaignId = (typeof LIFECYCLE_CAMPAIGN_IDS)[number];

export type LifecycleEmailChannel = 'service' | 'marketing';

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
  optional_draft_reminders_opt_out?: boolean;
};

export type LifecycleEligibilityInput = {
  preferences: LifecycleEmailPreferences | null;
  isBanned: boolean;
  email: string | null;
  /** Toute suppression y compris unsub (campagnes marketing). */
  suppressed: boolean;
  /** Bounce / plainte / manuel — bloque aussi le service. */
  hardSuppressed?: boolean;
  killSwitch: boolean;
  /** Cap 7j sur envois marketing uniquement. */
  hasSentWithinFrequencyCap: boolean;
  accountCreatedAtMs: number;
  /** Cutoff anti-rétroactif (ms). Obligatoire pour welcome / drafts post-évolution. */
  serviceCutoffMs: number;
  hasEverPublishedListing: boolean;
  draft?: {
    listingId: string;
    status: string;
    updatedAtMs: number;
    createdAtMs: number;
    lastPublishedAt: string | null;
  } | null;
  nowMs: number;
};

export function lifecycleCampaignChannel(
  campaignId: LifecycleCampaignId
): LifecycleEmailChannel {
  return campaignId === 'welcome_h0' ? 'service' : 'marketing';
}

export function hasValidMarketingConsent(
  preferences: LifecycleEmailPreferences | null
): boolean {
  if (!preferences) return false;
  if (preferences.unsubscribed_at != null) return false;
  return preferences.marketing_opt_in === true;
}

function isEligibleAccountSafety(input: LifecycleEligibilityInput): {
  ok: boolean;
  reason?: string;
} {
  if (input.killSwitch) return { ok: false, reason: 'kill_switch' };
  if (input.isBanned) return { ok: false, reason: 'banned' };
  const email = String(input.email ?? '').trim();
  if (!email) return { ok: false, reason: 'no_email' };
  return { ok: true };
}

/** Socle marketing : consentement + suppressions (y compris unsub) + fréquence. */
export function isEligibleCommon(input: LifecycleEligibilityInput): {
  ok: boolean;
  reason?: string;
} {
  const safety = isEligibleAccountSafety(input);
  if (!safety.ok) return safety;
  if (!hasValidMarketingConsent(input.preferences)) {
    return { ok: false, reason: 'no_consent' };
  }
  if (input.suppressed) return { ok: false, reason: 'suppressed' };
  if (input.hasSentWithinFrequencyCap) {
    return { ok: false, reason: 'frequency_cap' };
  }
  return { ok: true };
}

/**
 * Welcome service : pas d’opt-in marketing, cutoff anti-rétroactif,
 * suppressions dures uniquement, pas de cap fréquence marketing.
 */
export function isEligibleWelcome(input: LifecycleEligibilityInput): {
  ok: boolean;
  reason?: string;
} {
  const safety = isEligibleAccountSafety(input);
  if (!safety.ok) return safety;
  // Unsub marketing (suppressed) ne bloque pas ; hardSuppressed oui.
  if (input.hardSuppressed === true) {
    return { ok: false, reason: 'suppressed' };
  }
  if (input.accountCreatedAtMs < input.serviceCutoffMs) {
    return { ok: false, reason: 'pre_cutoff_no_retroactive' };
  }
  return { ok: true };
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
  if (input.preferences?.optional_draft_reminders_opt_out === true) {
    return { ok: false, reason: 'draft_reminders_opt_out' };
  }
  const draft = input.draft;
  if (!draft) return { ok: false, reason: 'draft_not_eligible' };
  if (draft.status !== 'draft') return { ok: false, reason: 'draft_not_eligible' };
  if (draft.lastPublishedAt != null) {
    return { ok: false, reason: 'draft_not_eligible' };
  }
  if (draft.createdAtMs < input.serviceCutoffMs) {
    return { ok: false, reason: 'pre_cutoff_no_retroactive' };
  }
  if (input.nowMs - draft.updatedAtMs < LIFECYCLE_DRAFT_ABANDON_MS) {
    return { ok: false, reason: 'too_early' };
  }
  return { ok: true };
}

export function campaignSubject(campaignId: LifecycleCampaignId): string {
  switch (campaignId) {
    case 'welcome_h0':
      return 'Votre compte YOUMBIA est créé';
    case 'first_listing_h24':
      return 'Et si vous publiiez votre première annonce ?';
    case 'abandoned_draft_h24':
      return 'Votre brouillon d’annonce est toujours en attente';
    default: {
      const _exhaustive: never = campaignId;
      return _exhaustive;
    }
  }
}
