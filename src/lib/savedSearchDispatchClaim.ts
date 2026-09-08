/**
 * Contrat du claim atomique saved-search (miroir SQL claim_saved_search_alerts).
 * Deux dispatchers (pg_net + cron) : un seul gagne les rows, un seul push.
 */

export const SAVED_SEARCH_CLAIM_STALE_MS = 10 * 60 * 1000;
export const SAVED_SEARCH_EXPIRE_AFTER_MS = 24 * 60 * 60 * 1000;

export type SavedSearchDispatchClaimOutcome = 'notified' | 'released' | 'expired';

export type SavedSearchDispatchMatch = {
  id: string;
  listing_id: string;
  notified_at: string | null;
  expired_at: string | null;
  dispatch_claim_id: string | null;
  dispatch_claimed_at: string | null;
  matched_at: string;
};

export function isSavedSearchClaimable(
  row: SavedSearchDispatchMatch,
  nowMs: number
): boolean {
  if (row.notified_at != null) return false;
  if (row.expired_at != null) return false;
  if (row.dispatch_claim_id == null || row.dispatch_claimed_at == null) return true;
  const claimedAt = Date.parse(row.dispatch_claimed_at);
  if (!Number.isFinite(claimedAt)) return true;
  return nowMs - claimedAt > SAVED_SEARCH_CLAIM_STALE_MS;
}

export function isSavedSearchCronCandidate(
  row: SavedSearchDispatchMatch,
  nowMs: number
): boolean {
  if (!isSavedSearchClaimable(row, nowMs)) return false;
  const matchedAt = Date.parse(row.matched_at);
  if (!Number.isFinite(matchedAt)) return false;
  return nowMs - matchedAt <= SAVED_SEARCH_EXPIRE_AFTER_MS;
}

export function shouldExpireSavedSearchMatch(
  row: SavedSearchDispatchMatch,
  nowMs: number
): boolean {
  if (row.notified_at != null) return false;
  if (row.expired_at != null) return false;
  const matchedAt = Date.parse(row.matched_at);
  if (!Number.isFinite(matchedAt)) return false;
  return nowMs - matchedAt > SAVED_SEARCH_EXPIRE_AFTER_MS;
}

/** Simulation d’un UPDATE … RETURNING atomique (premier writer gagne). */
export function claimSavedSearchMatches(
  store: SavedSearchDispatchMatch[],
  listingId: string,
  claimId: string,
  nowIso: string
): SavedSearchDispatchMatch[] {
  const nowMs = Date.parse(nowIso);
  const claimed: SavedSearchDispatchMatch[] = [];
  for (const row of store) {
    if (row.listing_id !== listingId) continue;
    if (!isSavedSearchClaimable(row, nowMs)) continue;
    row.dispatch_claim_id = claimId;
    row.dispatch_claimed_at = nowIso;
    claimed.push(row);
  }
  return claimed;
}

export function completeSavedSearchClaim(
  store: SavedSearchDispatchMatch[],
  claimId: string,
  matchIds: string[],
  outcome: SavedSearchDispatchClaimOutcome,
  nowIso: string
): number {
  const idSet = new Set(matchIds);
  let updated = 0;
  for (const row of store) {
    if (!idSet.has(row.id)) continue;
    if (row.dispatch_claim_id !== claimId) continue;
    if (row.notified_at != null || row.expired_at != null) continue;
    if (outcome === 'notified') {
      row.notified_at = nowIso;
      row.dispatch_claim_id = null;
      row.dispatch_claimed_at = null;
    } else if (outcome === 'expired') {
      row.expired_at = nowIso;
      row.dispatch_claim_id = null;
      row.dispatch_claimed_at = null;
    } else {
      row.dispatch_claim_id = null;
      row.dispatch_claimed_at = null;
    }
    updated += 1;
  }
  return updated;
}

export function expireSavedSearchMatches(
  store: SavedSearchDispatchMatch[],
  nowIso: string
): number {
  const nowMs = Date.parse(nowIso);
  let expired = 0;
  for (const row of store) {
    if (!shouldExpireSavedSearchMatch(row, nowMs)) continue;
    row.expired_at = nowIso;
    row.dispatch_claim_id = null;
    row.dispatch_claimed_at = null;
    expired += 1;
  }
  return expired;
}
