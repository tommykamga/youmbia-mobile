import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { mapResendWebhookToSuppression, verifyResendWebhookSignature } from './webhook';

describe('lifecycle webhook', () => {
  it('accepte une signature Svix valide', () => {
    const rawSecret = Buffer.from('super-secret-webhook-key!!').toString('base64');
    const secret = `whsec_${rawSecret}`;
    const rawBody = JSON.stringify({ type: 'email.bounced', data: { to: 'a@b.c' } });
    const svixId = 'msg_123';
    const svixTimestamp = String(Math.floor(Date.now() / 1000));
    const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;
    const key = Buffer.from(rawSecret, 'base64');
    const expected = createHmac('sha256', key).update(signedContent).digest('base64');
    const ok = verifyResendWebhookSignature({
      secret,
      rawBody,
      svixId,
      svixTimestamp,
      svixSignature: `v1,${expected}`,
    });
    expect(ok).toBe(true);
  });

  it('rejette signature invalide', () => {
    expect(
      verifyResendWebhookSignature({
        secret: 'whsec_YWJjZGVmZ2hpamtsbW5vcA==',
        rawBody: '{}',
        svixId: 'msg_1',
        svixTimestamp: String(Math.floor(Date.now() / 1000)),
        svixSignature: 'v1,AAAA',
      })
    ).toBe(false);
  });

  it('map hard bounce / complaint vers suppression', () => {
    expect(
      mapResendWebhookToSuppression({
        type: 'email.bounced',
        data: { to: 'A@B.C', bounce: { type: 'hard' }, email_id: 're_1' },
      })
    ).toMatchObject({ suppress: true, reason: 'hard_bounce', email: 'a@b.c' });

    expect(
      mapResendWebhookToSuppression({
        type: 'email.complained',
        data: { to: ['x@y.z'] },
      })
    ).toMatchObject({ suppress: true, reason: 'complaint', email: 'x@y.z' });

    expect(
      mapResendWebhookToSuppression({
        type: 'email.bounced',
        data: { to: 'a@b.c', bounce: { type: 'soft' } },
      }).suppress
    ).toBe(false);
  });
});
