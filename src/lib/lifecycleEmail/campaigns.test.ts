import { describe, expect, it } from 'vitest';
import {
  isEligibleAbandonedDraft,
  isEligibleFirstListing,
  isEligibleWelcome,
  type LifecycleEligibilityInput,
} from './campaigns';

const base = (over: Partial<LifecycleEligibilityInput> = {}): LifecycleEligibilityInput => ({
  preferences: { marketing_opt_in: true, unsubscribed_at: null },
  isBanned: false,
  email: 'user@example.com',
  suppressed: false,
  killSwitch: false,
  hasSentWithinFrequencyCap: false,
  accountCreatedAtMs: Date.parse('2026-10-01T00:00:00.000Z'),
  hasEverPublishedListing: false,
  draft: null,
  nowMs: Date.parse('2026-10-17T12:00:00.000Z'),
  ...over,
});

describe('lifecycle eligibility', () => {
  it('refuse welcome sans consentement', () => {
    expect(
      isEligibleWelcome(
        base({ preferences: { marketing_opt_in: false, unsubscribed_at: null } })
      )
    ).toEqual({ ok: false, reason: 'no_consent' });
  });

  it('refuse si désinscrit', () => {
    expect(
      isEligibleWelcome(
        base({
          preferences: {
            marketing_opt_in: true,
            unsubscribed_at: '2026-10-10T00:00:00.000Z',
          },
        })
      )
    ).toEqual({ ok: false, reason: 'no_consent' });
  });

  it('refuse banni / suppressed / kill switch / fréquence', () => {
    expect(isEligibleWelcome(base({ isBanned: true })).reason).toBe('banned');
    expect(isEligibleWelcome(base({ suppressed: true })).reason).toBe('suppressed');
    expect(isEligibleWelcome(base({ killSwitch: true })).reason).toBe('kill_switch');
    expect(isEligibleWelcome(base({ hasSentWithinFrequencyCap: true })).reason).toBe(
      'frequency_cap'
    );
  });

  it('accepte welcome avec consentement valide', () => {
    expect(isEligibleWelcome(base())).toEqual({ ok: true });
  });

  it('first_listing exige 24h et aucune publication', () => {
    expect(
      isEligibleFirstListing(
        base({
          accountCreatedAtMs: Date.parse('2026-10-17T00:00:00.000Z'),
          nowMs: Date.parse('2026-10-17T12:00:00.000Z'),
        })
      ).reason
    ).toBe('too_early');
    expect(
      isEligibleFirstListing(base({ hasEverPublishedListing: true })).reason
    ).toBe('already_published');
    expect(isEligibleFirstListing(base())).toEqual({ ok: true });
  });

  it('abandoned_draft exige draft vieux de 24h non publié', () => {
    expect(isEligibleAbandonedDraft(base()).reason).toBe('draft_not_eligible');
    expect(
      isEligibleAbandonedDraft(
        base({
          draft: {
            listingId: 'l1',
            status: 'draft',
            updatedAtMs: Date.parse('2026-10-17T00:00:00.000Z'),
            lastPublishedAt: null,
          },
          nowMs: Date.parse('2026-10-17T12:00:00.000Z'),
        })
      ).reason
    ).toBe('too_early');
    expect(
      isEligibleAbandonedDraft(
        base({
          draft: {
            listingId: 'l1',
            status: 'draft',
            updatedAtMs: Date.parse('2026-10-15T00:00:00.000Z'),
            lastPublishedAt: null,
          },
        })
      )
    ).toEqual({ ok: true });
  });
});
