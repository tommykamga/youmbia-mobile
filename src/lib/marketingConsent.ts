import type { EmailPreferences } from '@/services/emailPreferences';
import { MARKETING_CONSENT_VERSION } from '@/lib/marketingConsentVersion';

/**
 * Un ancien flag importé ou une source/date écrites par le client ne prouvent pas
 * le consentement. La liste doit rester synchronisée avec le helper SQL Lifecycle.
 */
const VERIFIED_SOURCES = ['authenticated_user_action'] as const;

export function hasVerifiableMarketingConsent(
  prefs: Pick<
    EmailPreferences,
    | 'marketing_opt_in'
    | 'marketing_opt_in_at'
    | 'marketing_opt_in_source'
    | 'marketing_opt_in_version'
    | 'unsubscribed_at'
  >
): boolean {
  return (
    prefs.marketing_opt_in === true &&
    prefs.unsubscribed_at == null &&
    typeof prefs.marketing_opt_in_at === 'string' &&
    prefs.marketing_opt_in_at.length > 0 &&
    prefs.marketing_opt_in_version === MARKETING_CONSENT_VERSION &&
    VERIFIED_SOURCES.some((source) => source === prefs.marketing_opt_in_source)
  );
}

/** Un désabonné peut se réinscrire dans Paramètres, mais ne subit pas de relance automatique. */
export function shouldOfferMarketingConsent(
  prefs: Parameters<typeof hasVerifiableMarketingConsent>[0]
): boolean {
  return prefs.unsubscribed_at == null && !hasVerifiableMarketingConsent(prefs);
}
