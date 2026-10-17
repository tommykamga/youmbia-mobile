import { describe, expect, it } from 'vitest';
import { isVerifiedCtaHref, resolveCampaignCta } from './cta';

describe('lifecycle CTA', () => {
  it('welcome HTTPS home est vérifié', () => {
    expect(isVerifiedCtaHref('https://www.youmbia.com/')).toBe(true);
    const cta = resolveCampaignCta('welcome_h0', { dryRun: true });
    expect(cta.enabled).toBe(true);
    expect(cta.href).toBe('https://www.youmbia.com/');
  });

  it('first_listing : CTA désactivé en dry-run (chemin sell non vérifié)', () => {
    const cta = resolveCampaignCta('first_listing_h24', { dryRun: true });
    expect(cta.enabled).toBe(false);
    expect(cta.href).toBeNull();
    expect(cta.reasonDisabled).toMatch(/unverified/);
  });

  it('abandoned_draft : CTA désactivé en dry-run sans annonce publiée', () => {
    const cta = resolveCampaignCta('abandoned_draft_h24', { dryRun: true });
    expect(cta.enabled).toBe(false);
  });

  it('rejette les CTA hors allowlist', () => {
    expect(isVerifiedCtaHref('https://evil.example/')).toBe(false);
    expect(isVerifiedCtaHref('https://www.youmbia.com/account/listings')).toBe(false);
  });
});
