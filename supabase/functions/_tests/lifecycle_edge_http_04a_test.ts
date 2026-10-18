/**
 * Lot 04A — endpoints HTTP locaux (127.0.0.1 uniquement).
 * Resend mocké / dry-run. Aucune exposition réseau externe.
 *
 * Limite explicite : prouve le code Edge via Deno.serve local,
 * PAS la compatibilité runtime `edge-runtime` Supabase Docker.
 */
import { createClient, mockState, resetMockState } from './mocks/supabase_js_mock.ts';

void createClient; // import map target must exist

function assert(cond: unknown, msg = 'assertion failed'): asserts cond {
  if (!cond) throw new Error(msg);
}
function assertEquals(a: unknown, b: unknown, msg?: string) {
  if (a !== b) throw new Error(msg ?? `expected ${Deno.inspect(b)}, got ${Deno.inspect(a)}`);
}

type Handler = (req: Request) => Response | Promise<Response>;

const captured: Handler[] = [];
const origServe = Deno.serve.bind(Deno);

// Capture handlers without binding ports yet
(Deno as unknown as { serve: typeof Deno.serve }).serve = ((arg: unknown) => {
  const handler =
    typeof arg === 'function'
      ? (arg as Handler)
      : ((arg as { handler: Handler }).handler);
  captured.push(handler);
  return {
    finished: Promise.resolve(),
    addr: { hostname: '127.0.0.1', port: 0, transport: 'tcp' },
    ref() {},
    unref() {},
    async shutdown() {},
  } as ReturnType<typeof Deno.serve>;
}) as typeof Deno.serve;

await import('../send-lifecycle-email/index.ts');
await import('../lifecycle-email-unsubscribe/index.ts');
await import('../lifecycle-email-webhook/index.ts');

assertEquals(captured.length, 3, 'expected 3 Deno.serve handlers');
const [sendHandler, unsubHandler, webhookHandler] = captured;

// Restore real serve for localhost servers
(Deno as unknown as { serve: typeof Deno.serve }).serve = origServe;

const realFetch = globalThis.fetch.bind(globalThis);
let resendMode: 'dry' | 'ok' | 'timeout' | 'no_id' | 'blocked_external' = 'dry';
let resendCalls = 0;

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  if (url.includes('api.resend.com')) {
    resendCalls += 1;
    if (resendMode === 'timeout') {
      throw new Error('AbortError: timeout mock');
    }
    if (resendMode === 'no_id') {
      return new Response(JSON.stringify({}), { status: 200 });
    }
    if (resendMode === 'ok') {
      return new Response(JSON.stringify({ id: 're_mock_1' }), { status: 200 });
    }
    throw new Error('resend_mock_unexpected');
  }
  if (url.startsWith('http://127.0.0.1:') || url.startsWith('http://localhost:')) {
    return realFetch(input, init);
  }
  throw new Error(`BLOCKED_EXTERNAL_FETCH:${url}`);
}) as typeof fetch;

function setEnv(map: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(map)) {
    if (v === undefined) Deno.env.delete(k);
    else Deno.env.set(k, v);
  }
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

async function svixSign(secretB64: string, id: string, ts: string, body: string): Promise<string> {
  const key = Uint8Array.from(atob(secretB64), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const buf = await crypto.subtle.sign(
    'HMAC',
    cryptoKey,
    new TextEncoder().encode(`${id}.${ts}.${body}`)
  );
  return `v1,${btoa(String.fromCharCode(...new Uint8Array(buf)))}`;
}

const HMAC = 'lot04a-hmac-test-only';
const DISPATCH = 'lot04a-dispatch-test-only';
const WHSEC_RAW = btoa('lot04a-webhook-secret!!');
const WHSEC = `whsec_${WHSEC_RAW}`;

setEnv({
  SUPABASE_URL: 'http://127.0.0.1:54321',
  SUPABASE_SECRET_KEYS: JSON.stringify({ default: 'service_role_test_key_not_real' }),
  LIFECYCLE_EMAIL_DISPATCH_SECRET: DISPATCH,
  LIFECYCLE_EMAIL_HMAC_SECRET: HMAC,
  LIFECYCLE_RESEND_WEBHOOK_SECRET: WHSEC,
  LIFECYCLE_RESEND_API_KEY: 'mock_blocked',
  LIFECYCLE_PUBLIC_FUNCTIONS_BASE: 'http://127.0.0.1:18772/functions/v1',
  LIFECYCLE_EMAIL_ALLOW_LIVE: undefined,
  LIFECYCLE_EMAIL_DRY_RUN: undefined,
});

const sendServer = Deno.serve({ hostname: '127.0.0.1', port: 18771 }, sendHandler!);
const unsubServer = Deno.serve({ hostname: '127.0.0.1', port: 18772 }, unsubHandler!);
const webhookServer = Deno.serve({ hostname: '127.0.0.1', port: 18773 }, webhookHandler!);

const UID = '11111111-1111-4111-8111-111111111111';

Deno.test('send: unauthorized sans secret', async () => {
  resetMockState({ killSwitch: false });
  const res = await fetch('http://127.0.0.1:18771/', { method: 'POST', body: '{}' });
  assertEquals(res.status, 401);
  assertEquals((await res.json()).error, 'unauthorized');
});

Deno.test('send: kill switch / empty claim → no_claim dry_run', async () => {
  resetMockState({ killSwitch: true, claims: [] });
  const res = await fetch('http://127.0.0.1:18771/', {
    method: 'POST',
    headers: { 'X-Lifecycle-Email-Dispatch-Secret': DISPATCH },
    body: '{}',
  });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.skipped, 'no_claim');
  assertEquals(body.dry_run, true);
  assertEquals(resendCalls, 0);
});

Deno.test('send: dry-run 3 campagnes — HTTPS + List-Unsubscribe, pas Resend réel', async () => {
  resendCalls = 0;
  resendMode = 'dry';
  const listingId = '22222222-2222-4222-8222-222222222222';
  resetMockState({
    killSwitch: false,
    claims: [
      {
        id: 'o1',
        user_id: UID,
        campaign_id: 'welcome_h0',
        occurrence_key: 'w',
        recipient_email: 'optin@example.test',
        attempts: 0,
        metadata: {},
      },
      {
        id: 'o2',
        user_id: UID,
        campaign_id: 'first_listing_h24',
        occurrence_key: 'f',
        recipient_email: 'optin@example.test',
        attempts: 0,
        metadata: {},
      },
      {
        id: 'o3',
        user_id: UID,
        campaign_id: 'abandoned_draft_h24',
        occurrence_key: listingId,
        recipient_email: 'optin@example.test',
        attempts: 0,
        metadata: { listing_id: listingId, listing_title: 'Vélo test' },
      },
    ],
    profiles: new Map([[UID, { full_name: 'Alex' }]]),
  });

  const res = await fetch('http://127.0.0.1:18771/', {
    method: 'POST',
    headers: { 'X-Lifecycle-Email-Dispatch-Secret': DISPATCH },
    body: '{}',
  });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.dry_run, true);
  assertEquals(body.claimed, 3);
  assert(body.skipped >= 3);
  assertEquals(resendCalls, 0);
  assert(mockState.lastRpc.includes('defer_lifecycle_email_after_dry_run'));
});

Deno.test('send: ALLOW_LIVE + mock_ key bloque Resend (safe mode)', async () => {
  resendCalls = 0;
  Deno.env.set('LIFECYCLE_EMAIL_ALLOW_LIVE', 'true');
  Deno.env.set('LIFECYCLE_RESEND_API_KEY', 'mock_blocked');
  resetMockState({
    killSwitch: false,
    claims: [
      {
        id: 'o4',
        user_id: UID,
        campaign_id: 'welcome_h0',
        occurrence_key: 'w2',
        recipient_email: 'optin@example.test',
        attempts: 0,
        metadata: {},
      },
    ],
  });
  const res = await fetch('http://127.0.0.1:18771/', {
    method: 'POST',
    headers: { 'X-Lifecycle-Email-Dispatch-Secret': DISPATCH },
    body: '{}',
  });
  assertEquals(res.status, 200);
  assertEquals(resendCalls, 0);
  Deno.env.delete('LIFECYCLE_EMAIL_ALLOW_LIVE');
});

Deno.test('send: timeout fournisseur → uncertain (fetch mock local)', async () => {
  resendCalls = 0;
  resendMode = 'timeout';
  Deno.env.set('LIFECYCLE_EMAIL_ALLOW_LIVE', 'true');
  Deno.env.set('LIFECYCLE_RESEND_API_KEY', 're_test_not_real_but_not_mock_prefix');
  resetMockState({
    killSwitch: false,
    claims: [
      {
        id: 'o5',
        user_id: UID,
        campaign_id: 'welcome_h0',
        occurrence_key: 'w3',
        recipient_email: 'optin@example.test',
        attempts: 0,
        metadata: {},
      },
    ],
  });
  const res = await fetch('http://127.0.0.1:18771/', {
    method: 'POST',
    headers: { 'X-Lifecycle-Email-Dispatch-Secret': DISPATCH },
    body: '{}',
  });
  const body = await res.json();
  assertEquals(res.status, 200);
  assert(resendCalls >= 1);
  assertEquals(body.uncertain, 1);
  Deno.env.delete('LIFECYCLE_EMAIL_ALLOW_LIVE');
  Deno.env.set('LIFECYCLE_RESEND_API_KEY', 'mock_blocked');
  resendMode = 'dry';
});

Deno.test('unsubscribe: GET non mutatif + POST applique', async () => {
  resetMockState();
  const ts = String(Math.floor(Date.now() / 1000));
  const email = 'optin@example.test';
  const sig = await hmacHex(HMAC, `${UID}|${email}|${ts}`);
  const q = `uid=${UID}&email=${encodeURIComponent(email)}&ts=${ts}&sig=${sig}`;

  const getRes = await fetch(`http://127.0.0.1:18772/?${q}`);
  assertEquals(getRes.status, 200);
  assert((await getRes.text()).includes('Confirmer'));
  assertEquals(mockState.unsubscribed.size, 0);

  const badSig = '00'.repeat(32);
  const badQ = `uid=${UID}&email=${encodeURIComponent(email)}&ts=${ts}&sig=${badSig}`;
  const badRes = await fetch(`http://127.0.0.1:18772/?${badQ}`, { method: 'POST' });
  assertEquals(badRes.status, 401);

  const postRes = await fetch(`http://127.0.0.1:18772/?${q}`, {
    method: 'POST',
    headers: { Accept: 'application/json' },
  });
  assertEquals(postRes.status, 200);
  assert(mockState.unsubscribed.has(`${UID}|${email}`));
});

Deno.test('webhook: signature invalide → 401 ; bounce → suppression', async () => {
  resetMockState();
  Deno.env.delete('LIFECYCLE_RESEND_WEBHOOK_SECRET_PREV');
  const body = JSON.stringify({
    type: 'email.bounced',
    data: { from: 'YOUMBIA <no-reply@youmbia.com>', tags: { product: 'youmbia_lifecycle_p0' }, to: 'Bounce@Example.TEST', bounce: { type: 'Permanent' }, email_id: 're_x' },
  });
  const bad = await fetch('http://127.0.0.1:18773/', {
    method: 'POST',
    headers: {
      'svix-id': 'msg_1',
      'svix-timestamp': String(Math.floor(Date.now() / 1000)),
      'svix-signature': 'v1,AAAA',
    },
    body,
  });
  assertEquals(bad.status, 401);

  const id = 'msg_2';
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = await svixSign(WHSEC_RAW, id, ts, body);
  const okRes = await fetch('http://127.0.0.1:18773/', {
    method: 'POST',
    headers: {
      'svix-id': id,
      'svix-timestamp': ts,
      'svix-signature': sig,
    },
    body,
  });
  assertEquals(okRes.status, 200);
  assertEquals(mockState.suppressions.get('bounce@example.test'), 'hard_bounce');
});

Deno.test('webhook dual: PREV (Free) valide ; primary (Pro) valide ; sans headers → 401', async () => {
  resetMockState();
  const WHSEC_PREV_RAW = btoa('lot04a-webhook-prev-secret!');
  const WHSEC_PREV = `whsec_${WHSEC_PREV_RAW}`;
  Deno.env.set('LIFECYCLE_RESEND_WEBHOOK_SECRET_PREV', WHSEC_PREV);

  const body = JSON.stringify({
    type: 'email.bounced',
    data: { from: 'YOUMBIA <no-reply@youmbia.com>', tags: { product: 'youmbia_lifecycle_p0' }, to: 'dual@example.test', bounce: { type: 'Permanent' }, email_id: 're_dual' },
  });

  const noHdr = await fetch('http://127.0.0.1:18773/', { method: 'POST', body });
  assertEquals(noHdr.status, 401);

  const idPrev = 'msg_prev';
  const ts = String(Math.floor(Date.now() / 1000));
  const sigPrev = await svixSign(WHSEC_PREV_RAW, idPrev, ts, body);
  const prevRes = await fetch('http://127.0.0.1:18773/', {
    method: 'POST',
    headers: {
      'svix-id': idPrev,
      'svix-timestamp': ts,
      'svix-signature': sigPrev,
    },
    body,
  });
  assertEquals(prevRes.status, 200);
  assertEquals(mockState.suppressions.get('dual@example.test'), 'hard_bounce');

  const complaintBody = JSON.stringify({
    type: 'email.complained',
    data: { from: 'YOUMBIA <no-reply@youmbia.com>', tags: { product: 'youmbia_lifecycle_p0' }, to: 'comp@example.test', email_id: 're_c' },
  });
  const idPro = 'msg_pro';
  const sigPro = await svixSign(WHSEC_RAW, idPro, ts, complaintBody);
  const proRes = await fetch('http://127.0.0.1:18773/', {
    method: 'POST',
    headers: {
      'svix-id': idPro,
      'svix-timestamp': ts,
      'svix-signature': sigPro,
    },
    body: complaintBody,
  });
  assertEquals(proRes.status, 200);
  assertEquals(mockState.suppressions.get('comp@example.test'), 'complaint');

  Deno.env.delete('LIFECYCLE_RESEND_WEBHOOK_SECRET_PREV');
});

Deno.test('webhook: primary absent → 500 ; PREV seul ne suffit pas', async () => {
  resetMockState();
  const saved = Deno.env.get('LIFECYCLE_RESEND_WEBHOOK_SECRET') ?? '';
  Deno.env.delete('LIFECYCLE_RESEND_WEBHOOK_SECRET');
  Deno.env.set('LIFECYCLE_RESEND_WEBHOOK_SECRET_PREV', WHSEC);
  const body = JSON.stringify({
    type: 'email.bounced',
    data: { from: 'YOUMBIA <no-reply@youmbia.com>', tags: { product: 'youmbia_lifecycle_p0' }, to: 'x@y.z', bounce: { type: 'Permanent' } },
  });
  const id = 'msg_noprimary';
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = await svixSign(WHSEC_RAW, id, ts, body);
  const res = await fetch('http://127.0.0.1:18773/', {
    method: 'POST',
    headers: {
      'svix-id': id,
      'svix-timestamp': ts,
      'svix-signature': sig,
    },
    body,
  });
  assertEquals(res.status, 500);
  assertEquals((await res.json()).error, 'server_misconfigured');
  Deno.env.set('LIFECYCLE_RESEND_WEBHOOK_SECRET', saved);
  Deno.env.delete('LIFECYCLE_RESEND_WEBHOOK_SECRET_PREV');
});

Deno.test('webhook: échec DB upsert → 500 (pas de succès trompeur)', async () => {
  resetMockState({ failSuppressionUpsert: true });
  const body = JSON.stringify({
    type: 'email.bounced',
    data: { from: 'YOUMBIA <no-reply@youmbia.com>', tags: { product: 'youmbia_lifecycle_p0' }, to: 'dbfail@example.test', bounce: { type: 'Permanent' }, email_id: 're_db' },
  });
  const id = 'msg_db';
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = await svixSign(WHSEC_RAW, id, ts, body);
  const res = await fetch('http://127.0.0.1:18773/', {
    method: 'POST',
    headers: {
      'svix-id': id,
      'svix-timestamp': ts,
      'svix-signature': sig,
    },
    body,
  });
  assertEquals(res.status, 500);
  assertEquals((await res.json()).error, 'db_error');
  assertEquals(mockState.suppressions.has('dbfail@example.test'), false);
});

Deno.test('webhook: événement dupliqué → suppression stable (idempotent)', async () => {
  resetMockState();
  const body = JSON.stringify({
    type: 'email.bounced',
    data: { from: 'YOUMBIA <no-reply@youmbia.com>', tags: { product: 'youmbia_lifecycle_p0' }, to: 'dup@example.test', bounce: { type: 'Permanent' }, email_id: 're_dup' },
  });
  const ts = String(Math.floor(Date.now() / 1000));
  for (const id of ['msg_d1', 'msg_d2']) {
    const sig = await svixSign(WHSEC_RAW, id, ts, body);
    const res = await fetch('http://127.0.0.1:18773/', {
      method: 'POST',
      headers: {
        'svix-id': id,
        'svix-timestamp': ts,
        'svix-signature': sig,
      },
      body,
    });
    assertEquals(res.status, 200);
  }
  assertEquals(mockState.suppressions.get('dup@example.test'), 'hard_bounce');
  assertEquals(mockState.events.filter((e) => e.p_event_type === 'bounced').length, 2);
});


Deno.test('webhook: foreign app and transient bounce cannot alter suppressions', async () => {
  resetMockState();
  const examples = [
    { type: 'email.bounced', data: { from: 'Other <mailer@stepward.app>', tags: { product: 'other' }, to: ['other@example.test'], email_id: 'outside_1', bounce: { type: 'Permanent' } } },
    { type: 'email.complained', data: { from: 'YOUMBIA <no-reply@youmbia.com>', tags: { product: 'other' }, to: ['other@example.test'], email_id: 'outside_2' } },
    { type: 'email.bounced', data: { from: 'YOUMBIA <no-reply@youmbia.com>', tags: { product: 'youmbia_lifecycle_p0' }, to: ['soft@example.test'], email_id: 'own_soft', bounce: { type: 'Transient' } } },
  ];
  for (const [i, event] of examples.entries()) {
    const body = JSON.stringify(event);
    const id = 'msg_scope_' + i;
    const ts = String(Math.floor(Date.now() / 1000));
    const signature = await svixSign(WHSEC_RAW, id, ts, body);
    const resp = await fetch('http://127.0.0.1:18773/', {
      method: 'POST',
      headers: { 'svix-id': id, 'svix-timestamp': ts, 'svix-signature': signature },
      body,
    });
    assertEquals(resp.status, 200);
  }
  assertEquals(mockState.suppressions.size, 0);
});

Deno.test('templates HTTPS subjects (source send)', async () => {
  const src = await Deno.readTextFile(
    new URL('../send-lifecycle-email/index.ts', import.meta.url)
  );
  assert(src.includes('Bienvenue sur YOUMBIA'));
  assert(src.includes('https://www.youmbia.com'));
  assert(src.includes('/annonce/'));
  assert(src.includes('List-Unsubscribe'));
});

Deno.test({
  name: 'shutdown servers',
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await sendServer.shutdown();
    await unsubServer.shutdown();
    await webhookServer.shutdown();
  },
});
