/**
 * Vérification signature webhook Resend (Svix-compatible, simplifiée pour tests).
 * Production Edge : même contrat (timestamp + signatures v1).
 * Dual-secret temporaire : primary (LIFECYCLE_RESEND_WEBHOOK_SECRET) + prev optionnel.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

export const LIFECYCLE_WEBHOOK_MAX_SKEW_MS = 5 * 60 * 1000;

/** Normalise une liste de secrets : trim, ignore vides, déduplique (ordre conservé). */
export function normalizeWebhookSecrets(secrets: (string | null | undefined)[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of secrets) {
    const s = typeof raw === 'string' ? raw.trim() : '';
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

export function verifyResendWebhookSignature(args: {
  secret: string;
  rawBody: string;
  svixId: string;
  svixTimestamp: string;
  svixSignature: string;
  nowMs?: number;
  maxSkewMs?: number;
}): boolean {
  const {
    secret,
    rawBody,
    svixId,
    svixTimestamp,
    svixSignature,
    nowMs = Date.now(),
    maxSkewMs = LIFECYCLE_WEBHOOK_MAX_SKEW_MS,
  } = args;

  if (!secret || !svixId || !svixTimestamp || !svixSignature) return false;

  const ts = Number(svixTimestamp);
  if (!Number.isFinite(ts)) return false;
  const skew = Math.abs(nowMs - ts * 1000);
  if (skew > maxSkewMs) return false;

  const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;
  // Secret Resend souvent préfixé "whsec_" → clé = base64 décodé.
  const key = secret.startsWith('whsec_')
    ? Buffer.from(secret.slice('whsec_'.length), 'base64')
    : Buffer.from(secret, 'utf8');
  const expected = createHmac('sha256', key).update(signedContent).digest('base64');

  const candidates = svixSignature
    .split(' ')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => (part.startsWith('v1,') ? part.slice(3) : part));

  const expectedBuf = Buffer.from(expected, 'base64');
  for (const cand of candidates) {
    try {
      const candBuf = Buffer.from(cand, 'base64');
      if (candBuf.length === expectedBuf.length && timingSafeEqual(candBuf, expectedBuf)) {
        return true;
      }
    } catch {
      /* ignore */
    }
  }
  return false;
}

/**
 * Accepte si au moins un secret de la liste valide cryptographiquement la signature.
 * Ne court-circuite pas la vérif HMAC : chaque secret candidat est vérifié entièrement.
 * Ne loggue jamais secrets ni signatures.
 */
export function verifyResendWebhookSignatureAny(args: {
  secrets: (string | null | undefined)[];
  rawBody: string;
  svixId: string;
  svixTimestamp: string;
  svixSignature: string;
  nowMs?: number;
  maxSkewMs?: number;
}): boolean {
  const secrets = normalizeWebhookSecrets(args.secrets);
  if (secrets.length === 0) return false;
  for (const secret of secrets) {
    if (
      verifyResendWebhookSignature({
        secret,
        rawBody: args.rawBody,
        svixId: args.svixId,
        svixTimestamp: args.svixTimestamp,
        svixSignature: args.svixSignature,
        nowMs: args.nowMs,
        maxSkewMs: args.maxSkewMs,
      })
    ) {
      return true;
    }
  }
  return false;
}

export type ResendWebhookEvent = {
  type: string;
  data?: {
    email_id?: string;
    to?: string[] | string;
    bounce?: { type?: string };
  };
};

export function mapResendWebhookToSuppression(event: ResendWebhookEvent): {
  suppress: boolean;
  reason: 'hard_bounce' | 'complaint' | 'soft_bounce_exhausted' | null;
  email: string | null;
  providerMessageId: string | null;
} {
  const emailRaw = event.data?.to;
  const email = Array.isArray(emailRaw)
    ? String(emailRaw[0] ?? '').trim().toLowerCase()
    : String(emailRaw ?? '').trim().toLowerCase();
  const providerMessageId = event.data?.email_id ?? null;
  const type = String(event.type ?? '');

  if (type === 'email.bounced') {
    const bounceType = String(event.data?.bounce?.type ?? 'hard').toLowerCase();
    if (bounceType === 'soft') {
      return { suppress: false, reason: null, email: email || null, providerMessageId };
    }
    return {
      suppress: Boolean(email),
      reason: 'hard_bounce',
      email: email || null,
      providerMessageId,
    };
  }
  if (type === 'email.complained') {
    return {
      suppress: Boolean(email),
      reason: 'complaint',
      email: email || null,
      providerMessageId,
    };
  }
  return { suppress: false, reason: null, email: email || null, providerMessageId };
}
