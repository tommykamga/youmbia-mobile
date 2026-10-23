import { describe, expect, it, vi } from 'vitest';
import { parseMessagePushRequest } from '../../supabase/functions/_shared/messagePushRequest';
import { handleDispatchRequest } from '../../supabase/functions/dispatch-transactional-push/request';

const messageId = '30000000-0000-0000-0000-000000000001';
const secret = 'synthetic-test-secret-with-32-characters';
const request = (body: unknown, authorized = true) => new Request('https://synthetic.invalid', {
  method: 'POST', headers: authorized ? { 'x-transactional-push-secret': secret } : { Authorization: 'Bearer untrusted-user' },
  body: JSON.stringify(body),
});
describe('push HTTP security boundaries', () => {
  it('accepts only a persisted message UUID for the legacy compatibility endpoint', () => {
    expect(parseMessagePushRequest({ message_id: messageId })).toBe(messageId);
  });
  it.each([
    { message_id: messageId, recipient_id: 'victim' },
    { message_id: messageId, expo_push_token: 'ExpoPushToken[attacker]' },
    { message_id: messageId, receiverId: 'victim' },
    { message_id: 'arbitrary' }, { message_id: null }, [], null,
  ])('refuses sender-controlled recipients, tokens or malformed message references: %j', body => {
    expect(parseMessagePushRequest(body)).toBeNull();
  });
  it('rejects a user JWT before any work, even with a forged recipient', async () => {
    const run = vi.fn();
    expect((await handleDispatchRequest(request({ recipient_id: 'victim' }, false), secret, true, run)).status).toBe(401);
    expect(run).not.toHaveBeenCalled();
  });
  it.each([{ recipient_id: 'victim' }, { to: 'ExpoPushToken[attacker]' }, { message_id: messageId }, [], null])(
    'rejects arbitrary payloads even from an authenticated scheduler: %j', async body => {
      const run = vi.fn();
      expect((await handleDispatchRequest(request(body), secret, true, run)).status).toBe(400);
      expect(run).not.toHaveBeenCalled();
    });
  it('keeps the worker OFF by default', async () => {
    const run = vi.fn();
    const response = await handleDispatchRequest(request({}), secret, false, run);
    expect(await response.json()).toEqual({ skipped: 'disabled' });
    expect(run).not.toHaveBeenCalled();
  });
  it('permits only an empty server wake-up and invokes the claimed work exactly once', async () => {
    const run = vi.fn().mockResolvedValue(Response.json({ claimed: 0 }));
    expect((await handleDispatchRequest(request({}), secret, true, run)).status).toBe(200);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith();
  });
});
