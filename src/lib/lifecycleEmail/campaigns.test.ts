import { describe, expect, it } from 'vitest';
import {
  isEligibleAbandonedDraft,
  isEligibleFirstListing,
  isEligibleWelcome,
  lifecycleCampaignChannel,
  type LifecycleEligibilityInput,
} from './campaigns';

const CUTOFF = Date.parse('2026-10-17T20:00:00.000Z');

const base = (over: Partial<LifecycleEligibilityInput> = {}): LifecycleEligibilityInput => ({
  preferences: {
    marketing_opt_in: true,
    unsubscribed_at: null,
    marketing_opt_in_source: 'signup',
  },
  isBanned: false,
  email: 'user@example.com',
  suppressed: false,
  hardSuppressed: false,
  killSwitch: false,
  hasSentWithinFrequencyCap: false,
  accountCreatedAtMs: Date.parse('2026-10-17T21:00:00.000Z'),
  serviceCutoffMs: CUTOFF,
  emailConfirmed: true,
  hasEverPublishedListing: false,
  draft: null,
  nowMs: Date.parse('2026-10-18T12:00:00.000Z'),
  ...over,
});

describe('lifecycle eligibility service vs marketing', () => {
  it('welcome = service ; other = marketing', () => {
    expect(lifecycleCampaignChannel('welcome_h0')).toBe('service');
    expect(lifecycleCampaignChannel('listing_published_service')).toBe('service');
    expect(lifecycleCampaignChannel('first_listing_h24')).toBe('marketing');
    expect(lifecycleCampaignChannel('abandoned_draft_h24')).toBe('marketing');
    expect(lifecycleCampaignChannel('reactivation_j15')).toBe('marketing');
  });

  it('welcome service : OK sans opt-in marketing', () => {
    expect(
      isEligibleWelcome(
        base({ preferences: { marketing_opt_in: false, unsubscribed_at: null } })
      )
    ).toEqual({ ok: true });
  });

  it('welcome : ancien compte pré-cutoff → aucune rétroactivité', () => {
    expect(
      isEligibleWelcome(
        base({ accountCreatedAtMs: Date.parse('2026-10-01T00:00:00.000Z') })
      )
    ).toEqual({ ok: false, reason: 'pre_cutoff_no_retroactive' });
  });

  it('welcome : unsub marketing (suppressed) n’bloque pas ; hard bounce oui', () => {
    expect(
      isEligibleWelcome(
        base({
          preferences: {
            marketing_opt_in: false,
            unsubscribed_at: '2026-10-18T00:00:00.000Z',
          },
          suppressed: true,
          hardSuppressed: false,
        })
      )
    ).toEqual({ ok: true });
    expect(isEligibleWelcome(base({ hardSuppressed: true })).reason).toBe('suppressed');
  });

  it('welcome : kill / banned / no email', () => {
    expect(isEligibleWelcome(base({ isBanned: true })).reason).toBe('banned');
    expect(isEligibleWelcome(base({ killSwitch: true })).reason).toBe('kill_switch');
    expect(isEligibleWelcome(base({ email: null })).reason).toBe('no_email');
  });

  it('welcome : fréquence marketing n’applique pas', () => {
    expect(isEligibleWelcome(base({ hasSentWithinFrequencyCap: true }))).toEqual({
      ok: true,
    });
  });

  it('welcome : adresse non confirmée → bloqué', () => {
    expect(isEligibleWelcome(base({ emailConfirmed: false })).reason).toBe(
      'email_not_confirmed'
    );
    expect(isEligibleWelcome(base({ emailConfirmed: undefined })).reason).toBe(
      'email_not_confirmed'
    );
  });

  it('first_listing sans opt-in → bloqué', () => {
    expect(
      isEligibleFirstListing(
        base({ preferences: { marketing_opt_in: false, unsubscribed_at: null } })
      )
    ).toEqual({ ok: false, reason: 'no_verifiable_consent' });
  });

  it('first_listing : source migration groupée → bloqué', () => {
    expect(
      isEligibleFirstListing(
        base({
          preferences: {
            marketing_opt_in: true,
            unsubscribed_at: null,
            marketing_opt_in_source: 'migration_initiale_youmbia_2026_10_18',
          },
        })
      ).reason
    ).toBe('no_verifiable_consent');
  });

  it('first_listing exige 24h et aucune publication', () => {
    expect(
      isEligibleFirstListing(
        base({
          accountCreatedAtMs: Date.parse('2026-10-18T00:00:00.000Z'),
          nowMs: Date.parse('2026-10-18T12:00:00.000Z'),
        })
      ).reason
    ).toBe('too_early');
    expect(
      isEligibleFirstListing(
        base({
          accountCreatedAtMs: Date.parse('2026-10-16T00:00:00.000Z'),
          hasEverPublishedListing: true,
        })
      ).reason
    ).toBe('already_published');
    expect(
      isEligibleFirstListing(
        base({ accountCreatedAtMs: Date.parse('2026-10-16T00:00:00.000Z') })
      )
    ).toEqual({ ok: true });
  });

  it('abandoned_draft : marketing + opposition draft + cutoff', () => {
    expect(isEligibleAbandonedDraft(base()).reason).toBe('draft_not_eligible');
    expect(
      isEligibleAbandonedDraft(
        base({
          preferences: {
            marketing_opt_in: true,
            unsubscribed_at: null,
            marketing_opt_in_source: 'signup',
            optional_draft_reminders_opt_out: true,
          },
          draft: {
            listingId: 'l1',
            status: 'draft',
            updatedAtMs: Date.parse('2026-10-16T00:00:00.000Z'),
            createdAtMs: Date.parse('2026-10-17T21:00:00.000Z'),
            lastPublishedAt: null,
          },
        })
      ).reason
    ).toBe('draft_reminders_opt_out');
    expect(
      isEligibleAbandonedDraft(
        base({
          draft: {
            listingId: 'l1',
            status: 'draft',
            updatedAtMs: Date.parse('2026-10-16T00:00:00.000Z'),
            createdAtMs: Date.parse('2026-10-01T00:00:00.000Z'),
            lastPublishedAt: null,
          },
        })
      ).reason
    ).toBe('pre_cutoff_no_retroactive');
    expect(
      isEligibleAbandonedDraft(
        base({
          draft: {
            listingId: 'l1',
            status: 'draft',
            updatedAtMs: Date.parse('2026-10-16T00:00:00.000Z'),
            createdAtMs: Date.parse('2026-10-17T21:00:00.000Z'),
            lastPublishedAt: null,
          },
        })
      )
    ).toEqual({ ok: true });
  });
});
