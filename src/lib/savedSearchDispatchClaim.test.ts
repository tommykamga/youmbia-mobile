import { describe, expect, it } from 'vitest';
import {
  SAVED_SEARCH_CLAIM_STALE_MS,
  claimSavedSearchMatches,
  completeSavedSearchClaim,
  expireSavedSearchMatches,
  isSavedSearchCronCandidate,
  type SavedSearchDispatchMatch,
} from './savedSearchDispatchClaim';

const T0 = '2026-09-09T00:00:00.000Z';
const T0_MS = Date.parse(T0);

function row(partial: Partial<SavedSearchDispatchMatch> = {}): SavedSearchDispatchMatch {
  return {
    id: partial.id ?? 'match-1',
    listing_id: partial.listing_id ?? 'listing-1',
    notified_at: partial.notified_at ?? null,
    expired_at: partial.expired_at ?? null,
    dispatch_claim_id: partial.dispatch_claim_id ?? null,
    dispatch_claimed_at: partial.dispatch_claimed_at ?? null,
    matched_at: partial.matched_at ?? T0,
  };
}

describe('savedSearchDispatchClaim', () => {
  it('deux dispatchers simultanés : un seul claim, un seul push', () => {
    const store = [row()];
    const first = claimSavedSearchMatches(store, 'listing-1', 'claim-a', T0);
    const second = claimSavedSearchMatches(store, 'listing-1', 'claim-b', T0);
    expect(first.map((item) => item.id)).toEqual(['match-1']);
    expect(second).toEqual([]);
    expect(store[0]?.dispatch_claim_id).toBe('claim-a');
  });

  it('un claim stale (> 10 min) est récupérable', () => {
    const store = [
      row({
        dispatch_claim_id: 'claim-old',
        dispatch_claimed_at: T0,
      }),
    ];
    const staleIso = new Date(T0_MS + SAVED_SEARCH_CLAIM_STALE_MS + 1).toISOString();
    const reclaimed = claimSavedSearchMatches(store, 'listing-1', 'claim-new', staleIso);
    expect(reclaimed).toHaveLength(1);
    expect(store[0]?.dispatch_claim_id).toBe('claim-new');
  });

  it('erreur Expo : claim libéré, row re-claimable', () => {
    const store = [row()];
    claimSavedSearchMatches(store, 'listing-1', 'claim-a', T0);
    expect(completeSavedSearchClaim(store, 'claim-a', ['match-1'], 'released', T0)).toBe(1);
    expect(store[0]?.dispatch_claim_id).toBeNull();
    expect(store[0]?.notified_at).toBeNull();
    const retry = claimSavedSearchMatches(store, 'listing-1', 'claim-b', T0);
    expect(retry).toHaveLength(1);
  });

  it('crash simulé : reclaim seulement après timeout', () => {
    const store = [row()];
    claimSavedSearchMatches(store, 'listing-1', 'claim-crash', T0);
    const beforeTimeout = new Date(T0_MS + SAVED_SEARCH_CLAIM_STALE_MS - 1).toISOString();
    expect(claimSavedSearchMatches(store, 'listing-1', 'claim-b', beforeTimeout)).toEqual([]);
    const afterTimeout = new Date(T0_MS + SAVED_SEARCH_CLAIM_STALE_MS + 1).toISOString();
    expect(claimSavedSearchMatches(store, 'listing-1', 'claim-b', afterTimeout)).toHaveLength(1);
  });

  it('succès => notified_at, claim cleared, pas de second push', () => {
    const store = [row()];
    claimSavedSearchMatches(store, 'listing-1', 'claim-a', T0);
    completeSavedSearchClaim(store, 'claim-a', ['match-1'], 'notified', T0);
    expect(store[0]?.notified_at).toBe(T0);
    expect(store[0]?.expired_at).toBeNull();
    expect(store[0]?.dispatch_claim_id).toBeNull();
    expect(claimSavedSearchMatches(store, 'listing-1', 'claim-b', T0)).toEqual([]);
  });

  it('expiration 24h => expired_at, jamais notified_at', () => {
    const store = [row({ matched_at: T0 })];
    const later = new Date(T0_MS + 24 * 60 * 60 * 1000 + 1).toISOString();
    expect(expireSavedSearchMatches(store, later)).toBe(1);
    expect(store[0]?.expired_at).toBe(later);
    expect(store[0]?.notified_at).toBeNull();
    expect(isSavedSearchCronCandidate(store[0]!, Date.parse(later))).toBe(false);
  });

  it('cron ignore notified et expired', () => {
    const now = Date.parse(T0);
    expect(isSavedSearchCronCandidate(row({ notified_at: T0 }), now)).toBe(false);
    expect(isSavedSearchCronCandidate(row({ expired_at: T0 }), now)).toBe(false);
    expect(isSavedSearchCronCandidate(row(), now)).toBe(true);
  });
});
