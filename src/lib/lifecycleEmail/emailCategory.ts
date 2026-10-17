/**
 * Séparation stricte marketing vs transactionnel.
 * Les emails lifecycle P0 sont TOUJOURS marketing — jamais requalifiés en Auth/OTP.
 */

export const LIFECYCLE_EMAIL_CATEGORY = 'marketing' as const;
export type LifecycleEmailCategory = typeof LIFECYCLE_EMAIL_CATEGORY;

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

export function assertLifecycleIsMarketing(category: string): void {
  if (category !== LIFECYCLE_EMAIL_CATEGORY) {
    throw new Error('lifecycle_email_must_be_marketing');
  }
  if (isTransactionalCategory(category)) {
    throw new Error('lifecycle_email_cannot_be_transactional');
  }
}

export function buildLifecycleResendTags(campaignId: string): { name: string; value: string }[] {
  assertLifecycleIsMarketing(LIFECYCLE_EMAIL_CATEGORY);
  return [
    { name: 'category', value: LIFECYCLE_EMAIL_CATEGORY },
    { name: 'campaign', value: campaignId },
    { name: 'product', value: 'youmbia_lifecycle_p0' },
  ];
}

export function buildLifecycleProviderHeaders(unsubscribeUrl: string): Record<string, string> {
  return {
    'List-Unsubscribe': `<${unsubscribeUrl}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    'X-Entity-Ref-ID': `youmbia-lifecycle-${Date.now()}`,
    // Jamais X-Transactional / Precedence bulk confondu avec Auth.
    Precedence: 'bulk',
  };
}
