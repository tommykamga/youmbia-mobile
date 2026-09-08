import { describe, expect, it } from 'vitest';
import {
  isListingRenewalDue,
  listingAgeInDays,
  listingPublishedAt,
  listingPublishedAtMs,
} from './listingPublishedAt';

const CREATED = '2026-01-01T00:00:00.000Z';
const RENEWED = '2026-03-01T00:00:00.000Z';
const NOW = Date.parse('2026-03-10T00:00:00.000Z');

describe('listingPublishedAt', () => {
  it('legacy sans renewal utilise created_at', () => {
    expect(listingPublishedAt({ created_at: CREATED })).toBe(CREATED);
    expect(listingPublishedAt({ created_at: CREATED, renewed_at: null, last_published_at: null })).toBe(
      CREATED
    );
  });

  it('privilégie last_published_at puis renewed_at, jamais updated_at', () => {
    expect(
      listingPublishedAt({
        created_at: CREATED,
        renewed_at: RENEWED,
        last_published_at: RENEWED,
      })
    ).toBe(RENEWED);
    expect(listingPublishedAt({ created_at: CREATED, renewed_at: RENEWED })).toBe(RENEWED);
  });

  it('compare les instants en ms pour le ranking', () => {
    const older = listingPublishedAtMs({ created_at: CREATED });
    const newer = listingPublishedAtMs({ created_at: CREATED, last_published_at: RENEWED });
    expect(newer).toBeGreaterThan(older);
  });
});

describe('isListingRenewalDue', () => {
  it('refuse une annonce trop récente', () => {
    expect(isListingRenewalDue({ created_at: '2026-03-09T00:00:00.000Z' }, NOW)).toBe(false);
  });

  it('autorise après 3 jours depuis la dernière publication, pas created_at', () => {
    expect(isListingRenewalDue({ created_at: '2025-01-01T00:00:00.000Z' }, NOW)).toBe(true);
    expect(
      isListingRenewalDue(
        { created_at: CREATED, last_published_at: '2026-03-09T00:00:00.000Z' },
        NOW
      )
    ).toBe(false);
    expect(listingAgeInDays({ created_at: CREATED }, Date.parse(CREATED))).toBe(0);
  });

  it('autorise à partir de 3 jours révolus (aligné SQL now() >= last + 3 days)', () => {
    expect(isListingRenewalDue({ created_at: '2026-03-07T00:00:00.000Z' }, NOW)).toBe(true);
    expect(isListingRenewalDue({ created_at: '2026-03-08T00:00:00.000Z' }, NOW)).toBe(false);
  });
});
