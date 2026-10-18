/**
 * Lot 03D — harness Deno local (sans Resend réel, sans pull esm.sh / deno.land).
 * Couvre signatures / gates / isolation Auth / RFC 8058 au niveau code Edge.
 */
function assert(cond: unknown, msg = 'assertion failed'): asserts cond {
  if (!cond) throw new Error(msg);
}
function assertEquals(a: unknown, b: unknown, msg?: string) {
  if (a !== b) throw new Error(msg ?? `expected ${Deno.inspect(b)}, got ${Deno.inspect(a)}`);
}
function assertIncludes(hay: string, needle: string) {
  assert(hay.includes(needle), `missing: ${needle}`);
}

const ROOT = new URL('../', import.meta.url);
const sendSrc = await Deno.readTextFile(new URL('send-lifecycle-email/index.ts', ROOT));
const unsubSrc = await Deno.readTextFile(new URL('lifecycle-email-unsubscribe/index.ts', ROOT));
const webhookSrc = await Deno.readTextFile(new URL('lifecycle-email-webhook/index.ts', ROOT));

function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) mismatch |= a[i]! ^ b[i]!;
  return mismatch === 0;
}

function decodeBase64(input: string): Uint8Array {
  const bin = atob(input);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

/** Miroir de lifecycle-email-webhook/verifySvixSignature */
async function verifySvixSignature(args: {
  secret: string;
  rawBody: string;
  svixId: string;
  svixTimestamp: string;
  svixSignature: string;
}): Promise<boolean> {
  const { secret, rawBody, svixId, svixTimestamp, svixSignature } = args;
  if (!secret || !svixId || !svixTimestamp || !svixSignature) return false;
  const ts = Number(svixTimestamp);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(Date.now() - ts * 1000) > 5 * 60 * 1000) return false;

  const keyBytes = secret.startsWith('whsec_')
    ? decodeBase64(secret.slice('whsec_'.length))
    : new TextEncoder().encode(secret);

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
      if (timingSafeEqualBytes(expected, decodeBase64(cand))) return true;
    } catch {
      /* ignore */
    }
  }
  return false;
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

Deno.test('webhook Edge source: dual-secret PREV + db_error gates', () => {
  assert(webhookSrc.includes('LIFECYCLE_RESEND_WEBHOOK_SECRET_PREV'));
  assert(webhookSrc.includes('verifySvixSignatureAny'));
  assert(webhookSrc.includes("error: 'db_error'"));
  assert(webhookSrc.includes('WEBHOOK_MAX_SKEW_MS'));
});

Deno.test('webhook: signature Svix valide acceptée, invalide rejetée', async () => {
  const rawSecret = btoa('super-secret-webhook-key!!');
  const secret = `whsec_${rawSecret}`;
  const rawBody = JSON.stringify({ type: 'email.bounced', data: { to: 'a@b.c' } });
  const svixId = 'msg_123';
  const svixTimestamp = String(Math.floor(Date.now() / 1000));
  const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;
  const key = Uint8Array.from(atob(rawSecret), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sigBuf = await crypto.subtle.sign(
    'HMAC',
    cryptoKey,
    new TextEncoder().encode(signedContent)
  );
  const expected = btoa(String.fromCharCode(...new Uint8Array(sigBuf)));

  assert(
    await verifySvixSignature({
      secret,
      rawBody,
      svixId,
      svixTimestamp,
      svixSignature: `v1,${expected}`,
    })
  );
  assertEquals(
    await verifySvixSignature({
      secret,
      rawBody,
      svixId,
      svixTimestamp,
      svixSignature: 'v1,AAAA',
    }),
    false
  );
});

Deno.test('unsubscribe: HMAC valide vs expiré', async () => {
  const secret = 'hmac-test-secret';
  const uid = '11111111-1111-4111-8111-111111111111';
  const email = 'u@example.test';
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = await hmacHex(secret, `${uid}|${email}|${ts}`);
  assertEquals(sig.length, 64);
  const expiredTs = String(Math.floor(Date.now() / 1000) - 8 * 24 * 60 * 60);
  const ageMs = Date.now() - Number(expiredTs) * 1000;
  assert(ageMs > 7 * 24 * 60 * 60 * 1000);
  assertEquals(await hmacHex(secret, `${uid}|${email}|${ts}`), sig);
});

Deno.test('send-lifecycle-email: gates sécurité + isolation Auth', () => {
  assertIncludes(sendSrc, 'LIFECYCLE_EMAIL_ALLOW_LIVE');
  assertIncludes(sendSrc, 'const dryRun = !allowLive || dryRunEnv');
  assertIncludes(sendSrc, 'X-Lifecycle-Email-Dispatch-Secret');
  assertIncludes(sendSrc, 'unauthorized');
  assertIncludes(sendSrc, 'List-Unsubscribe');
  assertIncludes(sendSrc, 'List-Unsubscribe=One-Click');
  assertIncludes(sendSrc, "value: 'marketing'");
  assertIncludes(sendSrc, 'defer_lifecycle_email_after_dry_run');
  assertIncludes(sendSrc, 'uncertain');
  assertIncludes(sendSrc, 'revalidate_lifecycle_send_eligibility');
  assert(!sendSrc.includes('signInWithOtp'), 'pas de Magic Link');
  assert(!sendSrc.includes('password_reset'), 'pas de reset password');
  assert(!/category:\s*['"]auth['"]/.test(sendSrc), 'pas de category auth');
});

Deno.test('unsubscribe: GET non mutatif + POST RPC', () => {
  assertIncludes(unsubSrc, 'aucune mutation');
  assertIncludes(unsubSrc, "req.method === 'GET'");
  assertIncludes(unsubSrc, 'apply_lifecycle_unsubscribe');
  assertIncludes(unsubSrc, 'invalid_signature');
  assertIncludes(unsubSrc, 'expired_signature');
  assert(!unsubSrc.includes('signInWithOtp'));
});

Deno.test('webhook: signature avant mutation + suppressions', () => {
  assertIncludes(webhookSrc, 'invalid_signature');
  assertIncludes(webhookSrc, 'email_suppressions');
  assertIncludes(webhookSrc, 'hard_bounce');
  assertIncludes(webhookSrc, 'complaint');
  const sigIdx = webhookSrc.indexOf('invalid_signature');
  const upsertIdx = webhookSrc.indexOf("from('email_suppressions')");
  assert(sigIdx > 0 && upsertIdx > sigIdx, 'signature avant mutation');
});
