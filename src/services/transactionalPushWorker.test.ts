import { describe, expect, it, vi } from 'vitest';
import { dispatch, payload, type Delivery, type Store } from '../../supabase/functions/dispatch-transactional-push/worker';

import { authorized } from '../../supabase/functions/dispatch-transactional-push/request';

const row: Delivery = { delivery_id: 'delivery', claim: 'lease', attempt: 1, kind: 'message',
  target_id: 'conversation', source_id: 'message', first_contact: false, expo_push_token: 'ExpoPushToken[test]' };
function store(rows: Delivery[] = [row]): Store {
  return { claim: vi.fn().mockResolvedValue(rows), finish: vi.fn(), receipts: vi.fn().mockResolvedValue([]), receipt: vi.fn(), invalidate: vi.fn() };
}
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
describe('transactional push worker', () => {
  it('requires the dedicated secret, never a user bearer token', () => {
    expect(authorized(new Request('https://local', { headers: { Authorization: 'Bearer user' } }), 'x'.repeat(32))).toBe(false);
    expect(authorized(new Request('https://local', { headers: { 'x-transactional-push-secret': 'x'.repeat(32) } }), 'x'.repeat(32))).toBe(true);
    expect(authorized(new Request('https://local'), undefined)).toBe(false);
  });
  it('builds generic message, first contact and favorite payloads without identity or content', () => {
    expect(payload(row)).toMatchObject({ title: 'Nouveau message YOUMBIA', body: 'Vous avez reçu un nouveau message.', data: { conversationId: 'conversation' } });
    expect(payload({ ...row, first_contact: true }).title).toBe('Un acheteur vous contacte');
    expect(payload({ ...row, kind: 'favorite' }).data).toEqual({ type: 'listing_favorite', listingId: 'conversation' });
  });
  it('stores accepted tickets and waits 15 minutes for receipts', async () => {
    const db = store();
    await dispatch(db, vi.fn().mockResolvedValue(response({ data: [{ status: 'ok', id: 'ticket' }] })), undefined, 0);
    expect(db.finish).toHaveBeenCalledWith(row, expect.objectContaining({ state: 'accepted', ticket_id: 'ticket', available_at: new Date(900000).toISOString() }));
  });
  it.each([429, 500, 503])('retries explicit HTTP %i with bounded backoff', async status => {
    const db = store();
    await dispatch(db, vi.fn().mockResolvedValue(response({}, status)), undefined, 0);
    expect(db.finish).toHaveBeenCalledWith(row, expect.objectContaining({ state: 'pending', available_at: new Date(30000).toISOString() }));
  });
  it('stops retrying after five attempts', async () => {
    const db = store([{ ...row, attempt: 5 }]);
    await dispatch(db, vi.fn().mockResolvedValue(response({}, 429)));
    expect(db.finish).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ state: 'failed' }));
  });
  it.each(['timeout', 'invalid_json', 'missing_ticket'])('quarantines ambiguous %s instead of replaying', async failure => {
    const db = store();
    const fetcher = vi.fn();
    if (failure === 'timeout') fetcher.mockRejectedValue(new Error('timeout'));
    else fetcher.mockResolvedValue(failure === 'invalid_json' ? new Response('broken') : response({ data: [] }));
    await dispatch(db, fetcher);
    expect(db.finish).toHaveBeenCalledWith(row, expect.objectContaining({ state: 'uncertain' }));
  });
  it('does not resend when saving a ticket fails', async () => {
    const db = store([row, { ...row, delivery_id: 'second-device' }]);
    vi.mocked(db.finish).mockRejectedValue(new Error('database down'));
    const fetcher = vi.fn().mockResolvedValue(response({ data: [{ status: 'ok', id: 'ticket' }] }));
    await expect(dispatch(db, fetcher)).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('cleans DeviceNotRegistered through a conditional database RPC', async () => {
    const db = store();
    await dispatch(db, vi.fn().mockResolvedValue(response({ data: [{ status: 'error', details: { error: 'DeviceNotRegistered' } }] })));
    expect(db.invalidate).toHaveBeenCalledWith('delivery');
  });
  it('checks receipts without sending again', async () => {
    const db = store([]);
    vi.mocked(db.receipts).mockResolvedValue([{ id: 'delivery', ticket_id: 'ticket', receipt_checks: 0 }]);
    const fetcher = vi.fn().mockResolvedValue(response({ data: { ticket: { status: 'ok' } } }));
    await dispatch(db, fetcher);
    expect(db.receipt).toHaveBeenCalledWith(expect.anything(), { state: 'delivered', error_code: null });
    expect(fetcher.mock.calls[0][0]).toContain('getReceipts');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('bounds missing receipt polling and never resends', async () => {
    const db = store([]);
    vi.mocked(db.receipts).mockResolvedValue([{ id: 'delivery', ticket_id: 'ticket', receipt_checks: 23 }]);
    await dispatch(db, vi.fn().mockResolvedValue(response({ data: {} })));
    expect(db.receipt).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ state: 'uncertain', receipt_checks: 24 }));
  });
});
