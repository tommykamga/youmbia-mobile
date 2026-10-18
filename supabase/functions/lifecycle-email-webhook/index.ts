// Edge Function: lifecycle-email-webhook
// Public (--no-verify-jwt). Vérifie signature Svix/Resend avant toute mutation.
// Dual-secret temporaire : LIFECYCLE_RESEND_WEBHOOK_SECRET (+ _PREV optionnel).
// Hard bounce / complaint → email_suppressions. Ne touche pas Auth.

import { createClient } from '../_shared/supabaseClient.ts';

const WEBHOOK_MAX_SKEW_MS = 5 * 60 * 1000;

const json = (status: number, payload: Record<string, unknown>) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

function readDefaultSecretKey(): string | null {
  const raw = Deno.env.get('SUPABASE_SECRET_KEYS') ?? '';
  try {
    const secretKeys = JSON.parse(raw);
    if (!secretKeys || typeof secretKeys !== 'object' || Array.isArray(secretKeys)) {
      return null;
    }
    const value = secretKeys['default'];
    if (typeof value !== 'string' || value.length === 0) return null;
    return value;
  } catch {
    return null;
  }
}

function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a[i] ^ b[i];
  }
  return mismatch === 0;
}

function decodeBase64(input: string): Uint8Array {
  const bin = atob(input);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

function normalizeWebhookSecrets(secrets: (string | null | undefined)[]): string[] {
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

async function verifySvixSignature(args: {
  secret: string;
  rawBody: string;
  svixId: string;
  svixTimestamp: string;
  svixSignature: string;
  nowMs?: number;
}): Promise<boolean> {
  const { secret, rawBody, svixId, svixTimestamp, svixSignature, nowMs = Date.now() } = args;
  if (!secret || !svixId || !svixTimestamp || !svixSignature) return false;

  const ts = Number(svixTimestamp);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(nowMs - ts * 1000) > WEBHOOK_MAX_SKEW_MS) return false;

  let keyBytes: Uint8Array;
  if (secret.startsWith('whsec_')) {
    keyBytes = decodeBase64(secret.slice('whsec_'.length));
  } else {
    keyBytes = new TextEncoder().encode(secret);
  }

  const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sigBuf = await crypto.subtle.sign(
    'HMAC',
    cryptoKey,
    new TextEncoder().encode(signedContent)
  );
  const expected = new Uint8Array(sigBuf);

  const candidates = svixSignature
    .split(' ')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => (p.startsWith('v1,') ? p.slice(3) : p));

  for (const cand of candidates) {
    try {
      const candBytes = decodeBase64(cand);
      if (timingSafeEqualBytes(expected, candBytes)) return true;
    } catch {
      /* ignore */
    }
  }
  return false;
}

/** Chaque secret est vérifié cryptographiquement ; PREV vide = ignoré (pas de bypass). */
async function verifySvixSignatureAny(args: {
  secrets: (string | null | undefined)[];
  rawBody: string;
  svixId: string;
  svixTimestamp: string;
  svixSignature: string;
}): Promise<boolean> {
  const secrets = normalizeWebhookSecrets(args.secrets);
  if (secrets.length === 0) return false;
  for (const secret of secrets) {
    if (
      await verifySvixSignature({
        secret,
        rawBody: args.rawBody,
        svixId: args.svixId,
        svixTimestamp: args.svixTimestamp,
        svixSignature: args.svixSignature,
      })
    ) {
      return true;
    }
  }
  return false;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return json(405, { error: 'method_not_allowed' });
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
  const SERVICE_ROLE_KEY = readDefaultSecretKey();
  const WEBHOOK_SECRET = (Deno.env.get('LIFECYCLE_RESEND_WEBHOOK_SECRET') ?? '').trim();
  const WEBHOOK_SECRET_PREV = (Deno.env.get('LIFECYCLE_RESEND_WEBHOOK_SECRET_PREV') ?? '').trim();

  // Secret principal obligatoire ; PREV optionnel (fenêtre dual Free/Pro).
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !WEBHOOK_SECRET) {
    return json(500, { error: 'server_misconfigured' });
  }

  const rawBody = await req.text();
  const svixId = String(req.headers.get('svix-id') ?? '').trim();
  const svixTimestamp = String(req.headers.get('svix-timestamp') ?? '').trim();
  const svixSignature = String(req.headers.get('svix-signature') ?? '').trim();

  if (!svixId || !svixTimestamp || !svixSignature) {
    return json(401, { error: 'invalid_signature' });
  }

  const valid = await verifySvixSignatureAny({
    secrets: [WEBHOOK_SECRET, WEBHOOK_SECRET_PREV],
    rawBody,
    svixId,
    svixTimestamp,
    svixSignature,
  });
  if (!valid) {
    return json(401, { error: 'invalid_signature' });
  }

  let event: {
    type?: string;
    data?: {
      email_id?: string;
      from?: string;
      tags?: Record<string, string>;
      to?: string[] | string;
      bounce?: { type?: string };
    };
  };
  try {
    event = JSON.parse(rawBody) as typeof event;
  } catch {
    return json(400, { error: 'invalid_json' });
  }

  const type = String(event.type ?? '');
  const emailRaw = event.data?.to;
  const email = Array.isArray(emailRaw)
    ? String(emailRaw[0] ?? '').trim().toLowerCase()
    : String(emailRaw ?? '').trim().toLowerCase();
  const providerMessageId = event.data?.email_id ?? null;

  // Resend webhooks are team-wide. Ignore other applications/domains (fail closed).
  // Lifecycle sendViaResend always supplies this product tag and one of these From addresses.
  if (type === 'email.bounced' || type === 'email.complained') {
    const rawFrom = String(event.data?.from ?? '').trim().toLowerCase();
    const from = rawFrom.match(/<([^<>]+)>/)?.[1]?.trim() ?? rawFrom;
    const senderAllowed =
      from === 'no-reply@youmbia.com' || from === 'no-reply@mail.youmbia.com';
    if (!senderAllowed || event.data?.tags?.product !== 'youmbia_lifecycle_p0') {
      return json(200, { ok: true, handled: 'ignored_foreign' });
    }
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  if (type === 'email.bounced') {
    const bounceType = String(event.data?.bounce?.type ?? '').toLowerCase();
    // Resend: Permanent = hard, Transient = soft, Undetermined = review manually.
    if ((bounceType === 'permanent' || bounceType === 'hard') && email) {
      const { error: upsertError } = await admin.from('email_suppressions').upsert(
        {
          email,
          reason: 'hard_bounce',
          source: 'resend_webhook',
        },
        { onConflict: 'email' }
      );
      if (upsertError) {
        return json(500, { error: 'db_error' });
      }
      const { error: logError } = await admin.rpc('log_lifecycle_email_event', {
        p_outbox_id: null,
        p_user_id: null,
        p_campaign_id: null,
        p_event_type: 'bounced',
        p_payload: { email, provider_message_id: providerMessageId },
      });
      if (logError) {
        return json(500, { error: 'db_error' });
      }
    }
    return json(200, { ok: true, handled: 'bounce' });
  }

  if (type === 'email.complained' && email) {
    const { error: upsertError } = await admin.from('email_suppressions').upsert(
      {
        email,
        reason: 'complaint',
        source: 'resend_webhook',
      },
      { onConflict: 'email' }
    );
    if (upsertError) {
      return json(500, { error: 'db_error' });
    }
    const { error: logError } = await admin.rpc('log_lifecycle_email_event', {
      p_outbox_id: null,
      p_user_id: null,
      p_campaign_id: null,
      p_event_type: 'complained',
      p_payload: { email, provider_message_id: providerMessageId },
    });
    if (logError) {
      return json(500, { error: 'db_error' });
    }
    return json(200, { ok: true, handled: 'complaint' });
  }

  return json(200, { ok: true, handled: 'ignored' });
});
