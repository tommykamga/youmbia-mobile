import { describe, expect, it } from 'vitest';
import {
  canAutoRetryStatus,
  claimLifecycleEmails,
  completeLifecycleClaim,
  type LifecycleOutboxRow,
} from './claim';

function row(over: Partial<LifecycleOutboxRow> = {}): LifecycleOutboxRow {
  return {
    id: 'a',
    user_id: 'u1',
    campaign_id: 'welcome_h0',
    occurrence_key: '',
    recipient_email: 'a@b.c',
    status: 'pending',
    attempts: 0,
    scheduled_for: '2026-10-17T10:00:00.000Z',
    claim_id: null,
    claimed_at: null,
    provider_message_id: null,
    last_error: null,
    sent_at: null,
    metadata: {},
    ...over,
  };
}

describe('lifecycle claim', () => {
  it('claim atomique : un seul claim_id gagne les rows', () => {
    const store = [row({ id: '1' }), row({ id: '2', campaign_id: 'first_listing_h24' })];
    const first = claimLifecycleEmails(store, 'claim-1', '2026-10-17T12:00:00.000Z', 10);
    expect(first).toHaveLength(2);
    const second = claimLifecycleEmails(store, 'claim-2', '2026-10-17T12:00:01.000Z', 10);
    expect(second).toHaveLength(0);
  });

  it('reclaim stale processing après 10 minutes', () => {
    const store = [
      row({
        id: '1',
        status: 'processing',
        claim_id: 'old',
        claimed_at: '2026-10-17T11:00:00.000Z',
        attempts: 1,
      }),
    ];
    const claimed = claimLifecycleEmails(store, 'new', '2026-10-17T11:11:00.000Z', 10);
    expect(claimed).toHaveLength(1);
    expect(claimed[0].claim_id).toBe('new');
    expect(claimed[0].attempts).toBe(2);
  });

  it('uncertain ne permet pas de retry auto', () => {
    const store = [row({ id: '1', status: 'processing', claim_id: 'c1', attempts: 1 })];
    completeLifecycleClaim(store, 'c1', ['1'], 'uncertain', '2026-10-17T12:00:00.000Z', {
      error: 'timeout',
    });
    expect(store[0].status).toBe('uncertain');
    expect(canAutoRetryStatus('uncertain')).toBe(false);
    const again = claimLifecycleEmails(store, 'c2', '2026-10-17T13:00:00.000Z', 10);
    expect(again).toHaveLength(0);
  });

  it('failed retryable repasse pending jusqu’au plafond', () => {
    const store = [row({ id: '1', status: 'processing', claim_id: 'c1', attempts: 2 })];
    completeLifecycleClaim(store, 'c1', ['1'], 'failed', '2026-10-17T12:00:00.000Z', {
      error: '429',
    });
    expect(store[0].status).toBe('pending');

    store[0].status = 'processing';
    store[0].claim_id = 'c2';
    store[0].attempts = 5;
    completeLifecycleClaim(store, 'c2', ['1'], 'failed', '2026-10-17T12:05:00.000Z', {
      error: 'boom',
    });
    expect(store[0].status).toBe('failed');
  });

  it('idempotence concurrence : complete ignore mauvais claim_id', () => {
    const store = [row({ id: '1', status: 'processing', claim_id: 'owner', attempts: 1 })];
    const n = completeLifecycleClaim(store, 'other', ['1'], 'sent', '2026-10-17T12:00:00.000Z');
    expect(n).toBe(0);
    expect(store[0].status).toBe('processing');
  });
});
