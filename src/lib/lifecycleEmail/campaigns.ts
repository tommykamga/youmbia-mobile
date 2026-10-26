import { MARKETING_CONSENT_VERSION } from '@/lib/marketingConsentVersion';

/**
 * Contrats campagnes Lifecycle Email (miroir SQL enqueue / revalidate).
 * Channel : welcome + listing_published = service ; reste = marketing.
 */

export const LIFECYCLE_CAMPAIGN_IDS = [
  'welcome_h0',
  'first_listing_h24',
  'abandoned_draft_h24',
  'reactivation_j15',
  'app_download',
  'weekly_discovery',
  'seller_activation',
  'listing_published_service',
] as const;

export type LifecycleCampaignId = (typeof LIFECYCLE_CAMPAIGN_IDS)[number];

export type LifecycleEmailChannel = 'service' | 'marketing';

export const LIFECYCLE_FREQUENCY_CAP_MS = 7 * 24 * 60 * 60 * 1000;
export const LIFECYCLE_DRAFT_ABANDON_MS = 24 * 60 * 60 * 1000;
export const LIFECYCLE_FIRST_LISTING_DELAY_MS = 24 * 60 * 60 * 1000;
export const LIFECYCLE_REACTIVATION_MS = 15 * 24 * 60 * 60 * 1000;
export const LIFECYCLE_CLAIM_STALE_MS = 10 * 60 * 1000;
export const LIFECYCLE_MAX_SEND_ATTEMPTS = 5;

/** Sources attestant un consentement marketing individuel (exclut migration groupée). */
export const LIFECYCLE_VERIFIABLE_MARKETING_SOURCES = ['signup', 'settings'] as const;

export const LIFECYCLE_BLOCKED_MARKETING_SOURCES = [
  'migration_initiale_youmbia_2026_10_18',
] as const;

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
  marketing_opt_in_at?: string | null;
  marketing_opt_in_source?: string | null;
  marketing_opt_in_version?: string | null;
  optional_draft_reminders_opt_out?: boolean;
};

export type LifecycleEligibilityInput = {
  preferences: LifecycleEmailPreferences | null;
  isBanned: boolean;
  email: string | null;
  suppressed: boolean;
  hardSuppressed?: boolean;
  killSwitch: boolean;
  hasSentWithinFrequencyCap: boolean;
  accountCreatedAtMs: number;
  serviceCutoffMs: number;
  emailConfirmed?: boolean;
  hasEverPublishedListing: boolean;
  lastSignInAtMs?: number | null;
  hasPushToken?: boolean;
  hasActiveDiscoveryListings?: boolean;
  draft?: {
    listingId: string;
    status: string;
    updatedAtMs: number;
    createdAtMs: number;
    lastPublishedAt: string | null;
  } | null;
  publishedListing?: {
    listingId: string;
    status: string;
    lastPublishedAtMs: number;
    factoryCutoffMs: number;
  } | null;
  nowMs: number;
};

export function lifecycleCampaignChannel(
  campaignId: LifecycleCampaignId
): LifecycleEmailChannel {
  if (campaignId === 'welcome_h0' || campaignId === 'listing_published_service') {
    return 'service';
  }
  return 'marketing';
}

export function hasVerifiableMarketingConsent(
  preferences: LifecycleEmailPreferences | null
): boolean {
  if (!preferences) return false;
  if (preferences.unsubscribed_at != null) return false;
  if (preferences.marketing_opt_in !== true) return false;
  if (!preferences.marketing_opt_in_at) return false;
  if (preferences.marketing_opt_in_version !== MARKETING_CONSENT_VERSION) return false;
  const source = String(preferences.marketing_opt_in_source ?? '').trim();
  if (!source) return false;
  if (
    (LIFECYCLE_BLOCKED_MARKETING_SOURCES as readonly string[]).includes(source)
  ) {
    return false;
  }
  return (LIFECYCLE_VERIFIABLE_MARKETING_SOURCES as readonly string[]).includes(
    source
  );
}

/** @deprecated Prefer hasVerifiableMarketingConsent — garde rétrocompat tests. */
export function hasValidMarketingConsent(
  preferences: LifecycleEmailPreferences | null
): boolean {
  return hasVerifiableMarketingConsent(preferences);
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

export function isEligibleCommon(input: LifecycleEligibilityInput): {
  ok: boolean;
  reason?: string;
} {
  const safety = isEligibleAccountSafety(input);
  if (!safety.ok) return safety;
  if (!hasVerifiableMarketingConsent(input.preferences)) {
    return { ok: false, reason: 'no_verifiable_consent' };
  }
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
  const safety = isEligibleAccountSafety(input);
  if (!safety.ok) return safety;
  if (input.hardSuppressed === true) {
    return { ok: false, reason: 'suppressed' };
  }
  if (input.accountCreatedAtMs < input.serviceCutoffMs) {
    return { ok: false, reason: 'pre_cutoff_no_retroactive' };
  }
  if (input.emailConfirmed !== true) {
    return { ok: false, reason: 'email_not_confirmed' };
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

export function isEligibleReactivationJ15(input: LifecycleEligibilityInput): {
  ok: boolean;
  reason?: string;
} {
  const common = isEligibleCommon(input);
  if (!common.ok) return common;
  const last = input.lastSignInAtMs;
  if (last == null || input.nowMs - last < LIFECYCLE_REACTIVATION_MS) {
    return { ok: false, reason: 'not_inactive_j15' };
  }
  return { ok: true };
}

export function isEligibleAppDownload(input: LifecycleEligibilityInput): {
  ok: boolean;
  reason?: string;
} {
  const common = isEligibleCommon(input);
  if (!common.ok) return common;
  if (input.hasPushToken === true) {
    return { ok: false, reason: 'has_push_token' };
  }
  return { ok: true };
}

export function isEligibleWeeklyDiscovery(input: LifecycleEligibilityInput): {
  ok: boolean;
  reason?: string;
} {
  const common = isEligibleCommon(input);
  if (!common.ok) return common;
  if (input.hasActiveDiscoveryListings !== true) {
    return { ok: false, reason: 'no_active_listings' };
  }
  return { ok: true };
}

export function isEligibleSellerActivation(input: LifecycleEligibilityInput): {
  ok: boolean;
  reason?: string;
} {
  const common = isEligibleCommon(input);
  if (!common.ok) return common;
  if (input.hasEverPublishedListing) {
    return { ok: false, reason: 'already_published' };
  }
  return { ok: true };
}

export function isEligibleListingPublishedService(
  input: LifecycleEligibilityInput
): {
  ok: boolean;
  reason?: string;
} {
  const safety = isEligibleAccountSafety(input);
  if (!safety.ok) return safety;
  if (input.hardSuppressed === true) {
    return { ok: false, reason: 'suppressed' };
  }
  if (input.emailConfirmed !== true) {
    return { ok: false, reason: 'email_not_confirmed' };
  }
  const pub = input.publishedListing;
  if (!pub) return { ok: false, reason: 'listing_not_public' };
  if (pub.status !== 'active') return { ok: false, reason: 'listing_not_public' };
  if (pub.lastPublishedAtMs < pub.factoryCutoffMs) {
    return { ok: false, reason: 'listing_not_public' };
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
    case 'reactivation_j15':
      return 'Ça fait un moment ! On se retrouve sur YOUMBIA ?';
    case 'app_download':
      return 'Retrouvez YOUMBIA sur votre téléphone';
    case 'weekly_discovery':
      return 'Découvrez les nouvelles annonces sur YOUMBIA';
    case 'seller_activation':
      return 'Votre prochain acheteur est peut-être sur YOUMBIA';
    case 'listing_published_service':
      return 'Votre annonce est publiée sur YOUMBIA';
    default: {
      const _exhaustive: never = campaignId;
      return _exhaustive;
    }
  }
}
