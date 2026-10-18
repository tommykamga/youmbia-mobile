import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  LIFECYCLE_WEBHOOK_MAX_SKEW_MS,
  mapResendWebhookToSuppression,
  normalizeWebhookSecrets,
  verifyResendWebhookSignature,
  verifyResendWebhookSignatureAny,
} from './webhook';

function whsecFromRaw(rawUtf8: string): { secret: string; rawB64: string } {
  const rawB64 = Buffer.from(rawUtf8).toString('base64');
  return { secret: `whsec_${rawB64}`, rawB64 };
}

function signBody(args: {
  rawB64: string;
  rawBody: string;
  svixId: string;
  svixTimestamp: string;
}): string {
  const key = Buffer.from(args.rawB64, 'base64');
  const signedContent = `${args.svixId}.${args.svixTimestamp}.${args.rawBody}`;
  const expected = createHmac('sha256', key).update(signedContent).digest('base64');
  return `v1,${expected}`;
}

describe('lifecycle webhook dual-signature', () => {
  const free = whsecFromRaw('free-webhook-secret-key!!');
  const pro = whsecFromRaw('pro-webhook-secret-key!!!');

  it('1 — signature Free (PREV) valide acceptée', () => {
    const rawBody = JSON.stringify({ type: 'email.bounced', data: { to: 'a@b.c' } });
    const svixId = 'msg_free';
    const svixTimestamp = String(Math.floor(Date.now() / 1000));
    const svixSignature = signBody({
      rawB64: free.rawB64,
      rawBody,
      svixId,
      svixTimestamp,
    });
    expect(
      verifyResendWebhookSignatureAny({
        secrets: [pro.secret, free.secret],
        rawBody,
        svixId,
        svixTimestamp,
        svixSignature,
      })
    ).toBe(true);
  });

  it('2 — signature Pro (primary) valide acceptée', () => {
    const rawBody = JSON.stringify({ type: 'email.complained', data: { to: 'a@b.c' } });
    const svixId = 'msg_pro';
    const svixTimestamp = String(Math.floor(Date.now() / 1000));
    const svixSignature = signBody({
      rawB64: pro.rawB64,
      rawBody,
      svixId,
      svixTimestamp,
    });
    expect(
      verifyResendWebhookSignatureAny({
        secrets: [pro.secret, free.secret],
        rawBody,
        svixId,
        svixTimestamp,
        svixSignature,
      })
    ).toBe(true);
  });

  it('3 — signature invalide rejetée', () => {
    expect(
      verifyResendWebhookSignatureAny({
        secrets: [pro.secret, free.secret],
        rawBody: '{}',
        svixId: 'msg_1',
        svixTimestamp: String(Math.floor(Date.now() / 1000)),
        svixSignature: 'v1,AAAA',
      })
    ).toBe(false);
  });

  it('4 — signature expirée (anti-rejeu) rejetée', () => {
    const rawBody = '{}';
    const svixId = 'msg_old';
    const svixTimestamp = String(
      Math.floor((Date.now() - LIFECYCLE_WEBHOOK_MAX_SKEW_MS - 60_000) / 1000)
    );
    const svixSignature = signBody({
      rawB64: pro.rawB64,
      rawBody,
      svixId,
      svixTimestamp,
    });
    expect(
      verifyResendWebhookSignatureAny({
        secrets: [pro.secret],
        rawBody,
        svixId,
        svixTimestamp,
        svixSignature,
      })
    ).toBe(false);
  });

  it('5 — absence de signature rejetée', () => {
    expect(
      verifyResendWebhookSignatureAny({
        secrets: [pro.secret],
        rawBody: '{}',
        svixId: 'msg_1',
        svixTimestamp: String(Math.floor(Date.now() / 1000)),
        svixSignature: '',
      })
    ).toBe(false);
  });

  it('6 — absence du secret principal → liste vide / false (Edge → 500)', () => {
    expect(normalizeWebhookSecrets(['', '  ', free.secret])).toEqual([free.secret]);
    // Caller Edge exige primary non vide avant verify ; without primary, any([]) → false
    expect(
      verifyResendWebhookSignatureAny({
        secrets: [],
        rawBody: '{}',
        svixId: 'msg_1',
        svixTimestamp: String(Math.floor(Date.now() / 1000)),
        svixSignature: 'v1,AAAA',
      })
    ).toBe(false);
  });

  it('7 — ancien secret absent : primary seul suffit', () => {
    const rawBody = JSON.stringify({ type: 'email.bounced', data: { to: 'a@b.c' } });
    const svixId = 'msg_solo';
    const svixTimestamp = String(Math.floor(Date.now() / 1000));
    const svixSignature = signBody({
      rawB64: pro.rawB64,
      rawBody,
      svixId,
      svixTimestamp,
    });
    expect(
      verifyResendWebhookSignatureAny({
        secrets: [pro.secret, ''],
        rawBody,
        svixId,
        svixTimestamp,
        svixSignature,
      })
    ).toBe(true);
    expect(normalizeWebhookSecrets([pro.secret, '', null, undefined])).toEqual([pro.secret]);
  });

  it('8 — hard bounce → suppression', () => {
    expect(
      mapResendWebhookToSuppression({
        type: 'email.bounced',
        data: { to: 'A@B.C', bounce: { type: 'hard' }, email_id: 're_1' },
      })
    ).toMatchObject({ suppress: true, reason: 'hard_bounce', email: 'a@b.c' });
  });

  it('9 — complaint → suppression', () => {
    expect(
      mapResendWebhookToSuppression({
        type: 'email.complained',
        data: { to: ['x@y.z'] },
      })
    ).toMatchObject({ suppress: true, reason: 'complaint', email: 'x@y.z' });
  });

  it('soft bounce ne suppress pas', () => {
    expect(
      mapResendWebhookToSuppression({
        type: 'email.bounced',
        data: { to: 'a@b.c', bounce: { type: 'soft' } },
      }).suppress
    ).toBe(false);
  });

  it('signature single-secret historique inchangée', () => {
    const rawBody = JSON.stringify({ type: 'email.bounced', data: { to: 'a@b.c' } });
    const svixId = 'msg_123';
    const svixTimestamp = String(Math.floor(Date.now() / 1000));
    const svixSignature = signBody({
      rawB64: free.rawB64,
      rawBody,
      svixId,
      svixTimestamp,
    });
    expect(
      verifyResendWebhookSignature({
        secret: free.secret,
        rawBody,
        svixId,
        svixTimestamp,
        svixSignature,
      })
    ).toBe(true);
  });

  it('11 — mapping idempotent (doublon event) : même suppression', () => {
    const event = {
      type: 'email.bounced' as const,
      data: { to: 'dup@example.test', bounce: { type: 'hard' }, email_id: 're_dup' },
    };
    const a = mapResendWebhookToSuppression(event);
    const b = mapResendWebhookToSuppression(event);
    expect(a).toEqual(b);
    expect(a.suppress).toBe(true);
    expect(a.reason).toBe('hard_bounce');
  });
});
