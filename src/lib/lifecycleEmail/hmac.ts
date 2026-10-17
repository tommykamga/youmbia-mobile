/**
 * Signatures HMAC-SHA256 pour liens unsub / click (Node + tests).
 * Edge Functions Dupliquent via Web Crypto.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

export type SignedUnsubPayload = {
  uid: string;
  email: string;
  ts: string;
};

export function signLifecyclePayload(
  secret: string,
  parts: string[]
): string {
  const h = createHmac('sha256', secret);
  h.update(parts.join('|'));
  return h.digest('hex');
}

export function verifyLifecycleSignature(
  secret: string,
  parts: string[],
  signature: string
): boolean {
  if (!secret || !signature) return false;
  const expected = signLifecyclePayload(secret, parts);
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(String(signature), 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function buildUnsubSignature(
  secret: string,
  payload: SignedUnsubPayload
): string {
  return signLifecyclePayload(secret, [payload.uid, payload.email, payload.ts]);
}

export function verifyUnsubSignature(
  secret: string,
  payload: SignedUnsubPayload,
  signature: string
): boolean {
  return verifyLifecycleSignature(
    secret,
    [payload.uid, payload.email, payload.ts],
    signature
  );
}

/** Fenêtre anti-rejeu signatures (7 jours). */
export const LIFECYCLE_SIG_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function isSignatureTimestampFresh(
  tsSeconds: string,
  nowMs: number,
  maxAgeMs = LIFECYCLE_SIG_MAX_AGE_MS
): boolean {
  const sec = Number(tsSeconds);
  if (!Number.isFinite(sec) || sec <= 0) return false;
  const age = nowMs - sec * 1000;
  return age >= 0 && age <= maxAgeMs;
}
