/**
 * Miroir logique claim/complete outbox lifecycle (tests unitaires hors SQL).
 */

import {
  LIFECYCLE_CLAIM_STALE_MS,
  LIFECYCLE_MAX_SEND_ATTEMPTS,
  type LifecycleOutboxStatus,
} from './campaigns';

export type LifecycleClaimOutcome =
  | 'sent'
  | 'skipped'
  | 'failed'
  | 'released'
  | 'uncertain';

export type LifecycleOutboxRow = {
  id: string;
  user_id: string;
  campaign_id: string;
  occurrence_key: string;
  recipient_email: string;
  status: LifecycleOutboxStatus;
  attempts: number;
  scheduled_for: string;
  claim_id: string | null;
  claimed_at: string | null;
  provider_message_id: string | null;
  last_error: string | null;
  sent_at: string | null;
  metadata: Record<string, unknown>;
};

export function isLifecycleClaimable(row: LifecycleOutboxRow, nowMs: number): boolean {
  if (row.status === 'pending') {
    const scheduled = Date.parse(row.scheduled_for);
    return Number.isFinite(scheduled) && scheduled <= nowMs;
  }
  if (row.status === 'processing') {
    // Déjà accepté ESP → pas de reclaim (évite double envoi).
    if (row.provider_message_id != null) return false;
    if (row.claim_id == null || row.claimed_at == null) return true;
    const claimedAt = Date.parse(row.claimed_at);
    if (!Number.isFinite(claimedAt)) return true;
    return nowMs - claimedAt > LIFECYCLE_CLAIM_STALE_MS;
  }
  return false;
}

/** Stale processing avec provider id → uncertain (miroir SQL Lot 02). */
export function promoteStaleProviderClaims(
  store: LifecycleOutboxRow[],
  nowIso: string
): number {
  const nowMs = Date.parse(nowIso);
  let n = 0;
  for (const row of store) {
    if (row.status !== 'processing') continue;
    if (row.provider_message_id == null) continue;
    const claimedAt = row.claimed_at ? Date.parse(row.claimed_at) : NaN;
    const stale =
      !Number.isFinite(claimedAt) || nowMs - claimedAt > LIFECYCLE_CLAIM_STALE_MS;
    if (!stale) continue;
    row.status = 'uncertain';
    row.last_error = row.last_error ?? 'stale_claim_with_provider_id';
    row.claim_id = null;
    row.claimed_at = null;
    n += 1;
  }
  return n;
}

/** Simulation UPDATE … FOR UPDATE SKIP LOCKED (premier writer gagne). */
export function claimLifecycleEmails(
  store: LifecycleOutboxRow[],
  claimId: string,
  nowIso: string,
  limit = 20
): LifecycleOutboxRow[] {
  const nowMs = Date.parse(nowIso);
  const claimed: LifecycleOutboxRow[] = [];
  const sorted = [...store].sort((a, b) => {
    const sa = Date.parse(a.scheduled_for) - Date.parse(b.scheduled_for);
    if (sa !== 0) return sa;
    return a.id.localeCompare(b.id);
  });
  for (const row of sorted) {
    if (claimed.length >= limit) break;
    if (!isLifecycleClaimable(row, nowMs)) continue;
    row.status = 'processing';
    row.claim_id = claimId;
    row.claimed_at = nowIso;
    row.attempts += 1;
    claimed.push(row);
  }
  return claimed;
}

export function completeLifecycleClaim(
  store: LifecycleOutboxRow[],
  claimId: string,
  outboxIds: string[],
  outcome: LifecycleClaimOutcome,
  nowIso: string,
  options?: { providerMessageId?: string | null; error?: string | null }
): number {
  const idSet = new Set(outboxIds);
  let updated = 0;
  for (const row of store) {
    if (!idSet.has(row.id)) continue;
    if (row.claim_id !== claimId) continue;
    if (row.status !== 'processing') continue;

    if (outcome === 'sent') {
      row.status = 'sent';
      row.sent_at = nowIso;
      row.provider_message_id = options?.providerMessageId ?? row.provider_message_id;
      row.last_error = null;
      row.claim_id = null;
      row.claimed_at = null;
    } else if (outcome === 'skipped') {
      row.status = 'skipped';
      row.last_error = options?.error ?? null;
      row.claim_id = null;
      row.claimed_at = null;
    } else if (outcome === 'uncertain') {
      row.status = 'uncertain';
      row.last_error = options?.error ?? 'provider_uncertain';
      row.provider_message_id = options?.providerMessageId ?? row.provider_message_id;
      row.claim_id = null;
      row.claimed_at = null;
    } else if (outcome === 'failed') {
      row.last_error = options?.error ?? 'failed';
      row.claim_id = null;
      row.claimed_at = null;
      if (row.attempts >= LIFECYCLE_MAX_SEND_ATTEMPTS) {
        row.status = 'failed';
      } else {
        row.status = 'pending';
        const backoffMin = Math.min(row.attempts, 5) * 5;
        row.scheduled_for = new Date(
          Date.parse(nowIso) + backoffMin * 60_000
        ).toISOString();
      }
    } else {
      row.status = 'pending';
      row.last_error = options?.error ?? null;
      row.claim_id = null;
      row.claimed_at = null;
    }
    updated += 1;
  }
  return updated;
}

/** uncertain / sent : jamais remis en pending par retry auto. */
export function canAutoRetryStatus(status: LifecycleOutboxStatus): boolean {
  return status === 'pending' || status === 'processing';
}
