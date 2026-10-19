import type { EmailPreferences } from '@/services/emailPreferences';

/**
 * Un ancien flag importé n'est pas une preuve de consentement.
 * La liste doit rester synchronisée avec lifecycle_has_verifiable_marketing_consent() côté SQL.
 */
const VERIFIED_SOURCES = ['signup', 'settings', 'mobile_home_prompt'] as const;

export function hasVerifiableMarketingConsent(
  prefs: Pick<
    EmailPreferences,
    'marketing_opt_in' | 'marketing_opt_in_at' | 'marketing_opt_in_source' | 'unsubscribed_at'
  >
): boolean {
  return (
    prefs.marketing_opt_in === true &&
    prefs.unsubscribed_at == null &&
    typeof prefs.marketing_opt_in_at === 'string' &&
    prefs.marketing_opt_in_at.length > 0 &&
    VERIFIED_SOURCES.some((source) => source === prefs.marketing_opt_in_source)
  );
}

/** Un désabonné peut se réinscrire dans Paramètres, mais ne subit pas de relance automatique. */
export function shouldOfferMarketingConsent(
  prefs: Parameters<typeof hasVerifiableMarketingConsent>[0]
): boolean {
  return prefs.unsubscribed_at == null && !hasVerifiableMarketingConsent(prefs);
}
