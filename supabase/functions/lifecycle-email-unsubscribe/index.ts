// Edge Function: lifecycle-email-unsubscribe
// Public (--no-verify-jwt en deploy). Signature HMAC obligatoire.
// GET = page confirmation (aucune mutation).
// POST = désinscription (RFC 8058 one-click ou formulaire).
// Ne touche pas aux templates Auth.

import { createClient } from '../_shared/supabaseClient.ts';

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

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ParsedUnsub = {
  uid: string;
  email: string;
  ts: string;
  sig: string;
};

function parseParams(url: URL): ParsedUnsub {
  return {
    uid: String(url.searchParams.get('uid') ?? '').trim(),
    email: String(url.searchParams.get('email') ?? '').trim().toLowerCase(),
    ts: String(url.searchParams.get('ts') ?? '').trim(),
    sig: String(url.searchParams.get('sig') ?? '').trim(),
  };
}

async function assertValidSignature(
  hmacSecret: string,
  params: ParsedUnsub
): Promise<Response | null> {
  const { uid, email, ts, sig } = params;
  if (!uid || !UUID_RE.test(uid) || !email || !ts || !sig) {
    return json(400, { error: 'invalid_params' });
  }
  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum) || tsNum <= 0) {
    return json(400, { error: 'invalid_ts' });
  }
  const ageMs = Date.now() - tsNum * 1000;
  if (ageMs < 0 || ageMs > 7 * 24 * 60 * 60 * 1000) {
    return json(401, { error: 'expired_signature' });
  }
  const expected = await hmacHex(hmacSecret, `${uid}|${email}|${ts}`);
  if (!timingSafeEqualStr(expected, sig)) {
    return json(401, { error: 'invalid_signature' });
  }
  return null;
}

function confirmationPage(actionUrl: string): string {
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"/><title>Désinscription YOUMBIA</title></head>
<body style="font-family:Arial,sans-serif;background:#F8FAFC;color:#0F172A;padding:40px;text-align:center;">
  <h1 style="color:#16A34A;">Confirmer la désinscription</h1>
  <p>Vous êtes sur le point de vous désinscrire des e-mails marketing YOUMBIA.</p>
  <form method="POST" action="${actionUrl}">
    <button type="submit" style="background:#16A34A;color:#fff;border:0;padding:12px 20px;border-radius:10px;font-size:16px;cursor:pointer;">
      Se désinscrire
    </button>
  </form>
  <p style="margin-top:24px;"><a href="https://www.youmbia.com" style="color:#16A34A;">Retour au site</a></p>
</body></html>`;
}

function successPage(): string {
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"/><title>Désinscription YOUMBIA</title></head>
<body style="font-family:Arial,sans-serif;background:#F8FAFC;color:#0F172A;padding:40px;text-align:center;">
  <h1 style="color:#16A34A;">Désinscription confirmée</h1>
  <p>Vous ne recevrez plus les e-mails marketing YOUMBIA.</p>
  <p><a href="https://www.youmbia.com" style="color:#16A34A;">Retour au site</a></p>
</body></html>`;
}

Deno.serve(async (req) => {
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
  const SERVICE_ROLE_KEY = readDefaultSecretKey();
  const HMAC_SECRET = Deno.env.get('LIFECYCLE_EMAIL_HMAC_SECRET') ?? '';

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !HMAC_SECRET) {
    return json(500, { error: 'server_misconfigured' });
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return json(405, { error: 'method_not_allowed' });
  }

  const url = new URL(req.url);
  const params = parseParams(url);
  const sigError = await assertValidSignature(HMAC_SECRET, params);
  if (sigError) return sigError;

  // GET : aucune mutation (évite prefetch mail → unsub involontaire).
  if (req.method === 'GET') {
    const actionUrl = url.pathname + url.search;
    return new Response(confirmationPage(actionUrl), {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const method = 'one_click_or_form';
  const { data, error } = await admin.rpc('apply_lifecycle_unsubscribe', {
    p_user_id: params.uid,
    p_email: params.email,
    p_method: method,
  });

  if (error || data !== true) {
    return json(500, { error: 'unsubscribe_failed' });
  }

  const accept = String(req.headers.get('accept') ?? '');
  if (accept.includes('text/html')) {
    return new Response(successPage(), {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }
  return new Response('OK', { status: 200 });
});
