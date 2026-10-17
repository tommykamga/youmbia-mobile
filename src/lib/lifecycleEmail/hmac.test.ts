import { describe, expect, it } from 'vitest';
import {
  buildUnsubSignature,
  isSignatureTimestampFresh,
  verifyUnsubSignature,
} from './hmac';

describe('lifecycle hmac', () => {
  it('signe et vérifie un unsub', () => {
    const secret = 'test_hmac_secret_32chars_minimum!!';
    const payload = {
      uid: '11111111-1111-4111-8111-111111111111',
      email: 'a@b.c',
      ts: '1690000000',
    };
    const sig = buildUnsubSignature(secret, payload);
    expect(verifyUnsubSignature(secret, payload, sig)).toBe(true);
    expect(verifyUnsubSignature(secret, payload, 'deadbeef')).toBe(false);
  });

  it('rejette timestamp trop vieux', () => {
    const now = Date.parse('2026-10-17T12:00:00.000Z');
    const oldTs = String(Math.floor((now - 8 * 24 * 60 * 60 * 1000) / 1000));
    expect(isSignatureTimestampFresh(oldTs, now)).toBe(false);
    const freshTs = String(Math.floor(now / 1000));
    expect(isSignatureTimestampFresh(freshTs, now)).toBe(true);
  });
});
