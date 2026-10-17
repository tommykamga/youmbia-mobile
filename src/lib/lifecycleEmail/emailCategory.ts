/**
 * Séparation service vs marketing pour le pipeline Lifecycle.
 * - welcome_h0 → service (lié à la création de compte)
 * - first_listing_h24 / abandoned_draft_h24 → marketing
 * Jamais requalifié en Auth / OTP / magic_link.
 */

import type { LifecycleCampaignId } from './campaigns';

export const LIFECYCLE_EMAIL_CATEGORY_MARKETING = 'marketing' as const;
export const LIFECYCLE_EMAIL_CATEGORY_SERVICE = 'service' as const;

/** @deprecated Prefer resolveLifecycleEmailCategory(campaignId). */
export const LIFECYCLE_EMAIL_CATEGORY = LIFECYCLE_EMAIL_CATEGORY_MARKETING;

export type LifecycleEmailCategory =
  | typeof LIFECYCLE_EMAIL_CATEGORY_MARKETING
  | typeof LIFECYCLE_EMAIL_CATEGORY_SERVICE;

/** Catégories Auth / compte — interdites pour le worker lifecycle. */
export const TRANSACTIONAL_EMAIL_CATEGORIES = [
  'auth',
  'transactional',
  'magic_link',
  'signup_confirm',
  'password_reset',
  'otp',
] as const;

export type TransactionalEmailCategory = (typeof TRANSACTIONAL_EMAIL_CATEGORIES)[number];

export function isTransactionalCategory(value: string | null | undefined): boolean {
  const v = String(value ?? '')
    .trim()
    .toLowerCase();
  return (TRANSACTIONAL_EMAIL_CATEGORIES as readonly string[]).includes(v);
}

export function resolveLifecycleEmailCategory(
  campaignId: LifecycleCampaignId | string
): LifecycleEmailCategory {
  if (campaignId === 'welcome_h0') return LIFECYCLE_EMAIL_CATEGORY_SERVICE;
  return LIFECYCLE_EMAIL_CATEGORY_MARKETING;
}

export function assertLifecycleCategoryAllowed(category: string): void {
  if (
    category !== LIFECYCLE_EMAIL_CATEGORY_MARKETING &&
    category !== LIFECYCLE_EMAIL_CATEGORY_SERVICE
  ) {
    throw new Error('lifecycle_email_invalid_category');
  }
  if (isTransactionalCategory(category)) {
    throw new Error('lifecycle_email_cannot_be_transactional');
  }
}

/** @deprecated Use assertLifecycleCategoryAllowed. */
export function assertLifecycleIsMarketing(category: string): void {
  if (category !== LIFECYCLE_EMAIL_CATEGORY_MARKETING) {
    throw new Error('lifecycle_email_must_be_marketing');
  }
  assertLifecycleCategoryAllowed(category);
}

export function buildLifecycleResendTags(
  campaignId: string
): { name: string; value: string }[] {
  const category = resolveLifecycleEmailCategory(campaignId);
  assertLifecycleCategoryAllowed(category);
  return [
    { name: 'category', value: category },
    { name: 'campaign', value: campaignId },
    { name: 'channel', value: category },
    { name: 'product', value: 'youmbia_lifecycle_p0' },
  ];
}

export function buildLifecycleProviderHeaders(
  unsubscribeUrl: string,
  category: LifecycleEmailCategory = LIFECYCLE_EMAIL_CATEGORY_MARKETING
): Record<string, string> {
  const headers: Record<string, string> = {
    'X-Entity-Ref-ID': `youmbia-lifecycle-${Date.now()}`,
  };
  if (category === LIFECYCLE_EMAIL_CATEGORY_MARKETING) {
    headers['List-Unsubscribe'] = `<${unsubscribeUrl}>`;
    headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
    headers.Precedence = 'bulk';
  }
  return headers;
}
