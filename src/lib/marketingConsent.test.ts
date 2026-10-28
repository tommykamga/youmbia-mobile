import { describe, expect, it } from 'vitest';
import { hasVerifiableMarketingConsent, shouldOfferMarketingConsent } from './marketingConsent';
import { MARKETING_CONSENT_COPY, MARKETING_CONSENT_VERSION } from './marketingConsentVersion';

const base = {
  marketing_opt_in: true,
  marketing_opt_in_at: '2026-10-19T00:00:00.000Z',
  marketing_opt_in_source: 'authenticated_user_action',
  marketing_opt_in_version: '2026-10-26.v1',
  unsubscribed_at: null,
};

describe('consentement marketing YOUMBIA Mobile', () => {
  it('ne considère pas un flag de migration comme un accord', () => {
    const legacy = { ...base, marketing_opt_in_source: 'migration_initiale_youmbia_2026_10_18' };
    expect(hasVerifiableMarketingConsent(legacy)).toBe(false);
    expect(shouldOfferMarketingConsent(legacy)).toBe(true);
  });
  it('ne valide pas une préférence sans version de texte serveur', () => {
    expect(hasVerifiableMarketingConsent({ ...base, marketing_opt_in_version: null })).toBe(false);
  });
  it('lie la version auditée à une copie explicite, facultative et révocable', () => {
    expect(MARKETING_CONSENT_VERSION).toBe('2026-10-26.v1');
    expect(MARKETING_CONSENT_COPY).toContain('facultatif');
    expect(MARKETING_CONSENT_COPY).toContain('révocable');
    expect(MARKETING_CONSENT_COPY).toContain('Les e-mails transactionnels');
  });
  it('ne considère pas une autorisation de test comme une preuve de campagne', () => {
    expect(hasVerifiableMarketingConsent({ ...base, marketing_opt_in_source: 'direct_user_authorization_chat' })).toBe(false);
  });
  it('reconnaît un consentement versionné dont la source est fixée côté serveur', () => {
    expect(hasVerifiableMarketingConsent(base)).toBe(true);
    expect(hasVerifiableMarketingConsent({ ...base, marketing_opt_in_source: 'signup' })).toBe(false);
    expect(hasVerifiableMarketingConsent({ ...base, marketing_opt_in_source: 'settings' })).toBe(false);
    expect(hasVerifiableMarketingConsent({ ...base, marketing_opt_in_source: 'mobile_home_prompt' })).toBe(false);
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
  it('accepter, refuser, révoquer puis accepter à nouveau suit l’état serveur', () => {
    const refused = {
      ...base,
      marketing_opt_in: false,
      marketing_opt_in_at: null,
      marketing_opt_in_source: 'settings',
      marketing_opt_in_version: null,
      unsubscribed_at: '2026-10-26T09:00:00.000Z',
    };
    const acceptedAgain = { ...base, marketing_opt_in_at: '2026-10-26T09:05:00.000Z' };
    expect(hasVerifiableMarketingConsent(base)).toBe(true);
    expect(shouldOfferMarketingConsent(refused)).toBe(false);
    expect(shouldOfferMarketingConsent(refused)).toBe(false);
    expect(hasVerifiableMarketingConsent(acceptedAgain)).toBe(true);
  });
});
