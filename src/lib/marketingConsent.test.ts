import { describe, expect, it } from 'vitest';
import { hasVerifiableMarketingConsent, shouldOfferMarketingConsent } from './marketingConsent';

const base = {
  marketing_opt_in: true,
  marketing_opt_in_at: '2026-10-19T00:00:00.000Z',
  marketing_opt_in_source: 'settings',
  unsubscribed_at: null,
};

describe('consentement marketing YOUMBIA Mobile', () => {
  it('ne considère pas un flag de migration comme un accord', () => {
    const legacy = { ...base, marketing_opt_in_source: 'migration_initiale_youmbia_2026_10_18' };
    expect(hasVerifiableMarketingConsent(legacy)).toBe(false);
    expect(shouldOfferMarketingConsent(legacy)).toBe(true);
  });
  it('ne considère pas une autorisation de test comme une preuve de campagne', () => {
    expect(hasVerifiableMarketingConsent({ ...base, marketing_opt_in_source: 'direct_user_authorization_chat' })).toBe(false);
  });
  it('reconnaît une acceptation explicite depuis la bannière, avec horodatage', () => {
    const prefs = { ...base, marketing_opt_in_source: 'mobile_home_prompt' };
    expect(hasVerifiableMarketingConsent(prefs)).toBe(true);
    expect(shouldOfferMarketingConsent(prefs)).toBe(false);
  });
  it('reconnaît un consentement valide en Paramètres ou inscription', () => {
    expect(hasVerifiableMarketingConsent(base)).toBe(true);
    expect(hasVerifiableMarketingConsent({ ...base, marketing_opt_in_source: 'signup' })).toBe(true);
  });
  it('exige une date de consentement', () => {
    expect(hasVerifiableMarketingConsent({ ...base, marketing_opt_in_at: null })).toBe(false);
  });
  it('ne réinscrit ni ne sollicite automatiquement un désabonné', () => {
    const optedOut = { ...base, unsubscribed_at: '2026-10-18T15:00:00.000Z' };
    expect(hasVerifiableMarketingConsent(optedOut)).toBe(false);
    expect(shouldOfferMarketingConsent(optedOut)).toBe(false);
  });
  it('ne sollicite pas les consentements déjà établis', () => {
    expect(shouldOfferMarketingConsent(base)).toBe(false);
  });
});
