import { describe, expect, it } from 'vitest';
import {
  applyListingRenewalInsert,
  applyListingRenewalUpdate,
  LISTING_RENEWAL_COOLDOWN_ERROR,
  LISTING_RENEWAL_SUSPENDED_ERROR,
  ListingRenewalCooldownError,
  ListingRenewalSuspendedError,
} from './listingRenewal';

const CREATED = '2026-01-01T00:00:00.000Z';
const FIRST_RENEW = '2026-01-10T00:00:00.000Z';
const TWO_DAYS_LATER = '2026-01-12T00:00:00.000Z';
const FOUR_DAYS_LATER = '2026-01-14T00:00:00.000Z';
const FORGED_PAST = '1999-01-01T00:00:00.000Z';
const FORGED_FUTURE = '2099-01-01T00:00:00.000Z';

describe('applyListingRenewalInsert', () => {
  it('nouvelle annonce : renewed_at NULL (client ignoré)', () => {
    expect(applyListingRenewalInsert({ clientRenewedAt: FORGED_PAST })).toEqual({ renewed_at: null });
  });
});

describe('applyListingRenewalUpdate', () => {
  it('sold → active avant 3 jours : réactivation sans boost', () => {
    expect(
      applyListingRenewalUpdate({
        oldStatus: 'sold',
        newStatus: 'active',
        oldRenewedAt: FIRST_RENEW,
        oldCreatedAt: CREATED,
        now: TWO_DAYS_LATER,
        clientRenewedAt: FORGED_FUTURE,
      })
    ).toEqual({ renewed_at: FIRST_RENEW });
  });

  it('sold → active après 3 jours : boost ranking', () => {
    expect(
      applyListingRenewalUpdate({
        oldStatus: 'sold',
        newStatus: 'active',
        oldRenewedAt: FIRST_RENEW,
        oldCreatedAt: CREATED,
        now: FOUR_DAYS_LATER,
        clientRenewedAt: FORGED_PAST,
      })
    ).toEqual({ renewed_at: FOUR_DAYS_LATER });
  });

  it('active → sold → active en moins de 3 jours : aucun boost, réactivation PASS', () => {
    const afterSold = applyListingRenewalUpdate({
      oldStatus: 'active',
      newStatus: 'sold',
      oldRenewedAt: FIRST_RENEW,
      oldCreatedAt: CREATED,
      now: TWO_DAYS_LATER,
    });
    expect(afterSold.renewed_at).toBe(FIRST_RENEW);

    const reactivated = applyListingRenewalUpdate({
      oldStatus: 'sold',
      newStatus: 'active',
      oldRenewedAt: afterSold.renewed_at,
      oldCreatedAt: CREATED,
      now: TWO_DAYS_LATER,
      clientRenewedAt: FORGED_FUTURE,
    });
    expect(reactivated.renewed_at).toBe(FIRST_RENEW);
  });

  it('répétition active → sold → active : impossible de contourner le cooldown', () => {
    let renewedAt: string | null = FIRST_RENEW;
    for (let index = 0; index < 3; index += 1) {
      const sold = applyListingRenewalUpdate({
        oldStatus: 'active',
        newStatus: 'sold',
        oldRenewedAt: renewedAt,
        oldCreatedAt: CREATED,
        now: TWO_DAYS_LATER,
      });
      const active = applyListingRenewalUpdate({
        oldStatus: 'sold',
        newStatus: 'active',
        oldRenewedAt: sold.renewed_at,
        oldCreatedAt: CREATED,
        now: TWO_DAYS_LATER,
        clientRenewedAt: FORGED_PAST,
      });
      expect(active.renewed_at).toBe(FIRST_RENEW);
      renewedAt = active.renewed_at;
    }
  });

  it('hidden → active ne pose pas renewed_at (reprise, pas un renewal)', () => {
    expect(
      applyListingRenewalUpdate({
        oldStatus: 'hidden',
        newStatus: 'active',
        oldRenewedAt: null,
        oldCreatedAt: CREATED,
        now: FOUR_DAYS_LATER,
        clientRenewedAt: FORGED_FUTURE,
      })
    ).toEqual({ renewed_at: null });
  });

  it('hidden → active conserve un renewed_at déjà posé', () => {
    expect(
      applyListingRenewalUpdate({
        oldStatus: 'hidden',
        newStatus: 'active',
        oldRenewedAt: FIRST_RENEW,
        oldCreatedAt: CREATED,
        now: FOUR_DAYS_LATER,
        clientRenewedAt: FORGED_FUTURE,
      })
    ).toEqual({ renewed_at: FIRST_RENEW });
  });

  it('active → active sans demande client (title/price) conserve OLD', () => {
    expect(
      applyListingRenewalUpdate({
        oldStatus: 'active',
        newStatus: 'active',
        oldRenewedAt: FIRST_RENEW,
        oldCreatedAt: CREATED,
        now: FOUR_DAYS_LATER,
      })
    ).toEqual({ renewed_at: FIRST_RENEW });
  });

  it('active renewal après > 3 jours : PASS, clamp à now (pas la date cliente)', () => {
    expect(
      applyListingRenewalUpdate({
        oldStatus: 'active',
        newStatus: 'active',
        oldRenewedAt: FIRST_RENEW,
        oldCreatedAt: CREATED,
        now: FOUR_DAYS_LATER,
        clientRenewedAt: FORGED_PAST,
      })
    ).toEqual({ renewed_at: FOUR_DAYS_LATER });
    expect(
      applyListingRenewalUpdate({
        oldStatus: 'active',
        newStatus: 'active',
        oldRenewedAt: FIRST_RENEW,
        oldCreatedAt: CREATED,
        now: FOUR_DAYS_LATER,
        clientRenewedAt: FORGED_FUTURE,
      })
    ).toEqual({ renewed_at: FOUR_DAYS_LATER });
  });

  it('active renewal avant 3 jours : REFUS', () => {
    expect(() =>
      applyListingRenewalUpdate({
        oldStatus: 'active',
        newStatus: 'active',
        oldRenewedAt: FIRST_RENEW,
        oldCreatedAt: CREATED,
        now: TWO_DAYS_LATER,
        clientRenewedAt: FORGED_FUTURE,
      })
    ).toThrow(ListingRenewalCooldownError);
    expect(() =>
      applyListingRenewalUpdate({
        oldStatus: 'active',
        newStatus: 'active',
        oldRenewedAt: FIRST_RENEW,
        oldCreatedAt: CREATED,
        now: TWO_DAYS_LATER,
        clientRenewedAt: FORGED_PAST,
      })
    ).toThrow(LISTING_RENEWAL_COOLDOWN_ERROR);
  });

  it('double renewal immédiat : second REFUS', () => {
    const first = applyListingRenewalUpdate({
      oldStatus: 'active',
      newStatus: 'active',
      oldRenewedAt: CREATED,
      oldCreatedAt: CREATED,
      now: FOUR_DAYS_LATER,
      clientRenewedAt: FORGED_PAST,
    });
    expect(first.renewed_at).toBe(FOUR_DAYS_LATER);
    expect(() =>
      applyListingRenewalUpdate({
        oldStatus: 'active',
        newStatus: 'active',
        oldRenewedAt: first.renewed_at,
        oldCreatedAt: CREATED,
        now: FOUR_DAYS_LATER,
        clientRenewedAt: FORGED_FUTURE,
      })
    ).toThrow(ListingRenewalCooldownError);
  });

  it('legacy sans renewed_at : cooldown depuis created_at', () => {
    expect(() =>
      applyListingRenewalUpdate({
        oldStatus: 'active',
        newStatus: 'active',
        oldRenewedAt: null,
        oldCreatedAt: TWO_DAYS_LATER,
        now: FOUR_DAYS_LATER,
        clientRenewedAt: FORGED_PAST,
      })
    ).toThrow(ListingRenewalCooldownError);
  });

  it('suspended + tentative renewed_at : REFUS', () => {
    expect(() =>
      applyListingRenewalUpdate({
        oldStatus: 'suspended',
        newStatus: 'suspended',
        oldRenewedAt: null,
        oldCreatedAt: CREATED,
        now: FOUR_DAYS_LATER,
        clientRenewedAt: FORGED_FUTURE,
      })
    ).toThrow(ListingRenewalSuspendedError);
    expect(() =>
      applyListingRenewalUpdate({
        oldStatus: 'suspended',
        newStatus: 'active',
        oldRenewedAt: null,
        oldCreatedAt: CREATED,
        now: FOUR_DAYS_LATER,
        clientRenewedAt: FORGED_PAST,
      })
    ).toThrow(LISTING_RENEWAL_SUSPENDED_ERROR);
  });

  it('sold → active legacy (renewed_at null) avant 3 jours depuis created_at : pas de boost', () => {
    expect(
      applyListingRenewalUpdate({
        oldStatus: 'sold',
        newStatus: 'active',
        oldRenewedAt: null,
        oldCreatedAt: TWO_DAYS_LATER,
        now: FOUR_DAYS_LATER,
        clientRenewedAt: FORGED_FUTURE,
      })
    ).toEqual({ renewed_at: null });
  });

  it('sold → hidden ne pose pas renewed_at (pas une remise en ligne)', () => {
    expect(
      applyListingRenewalUpdate({
        oldStatus: 'sold',
        newStatus: 'hidden',
        oldRenewedAt: null,
        oldCreatedAt: CREATED,
        now: FOUR_DAYS_LATER,
        clientRenewedAt: FORGED_PAST,
      })
    ).toEqual({ renewed_at: null });
  });
});
