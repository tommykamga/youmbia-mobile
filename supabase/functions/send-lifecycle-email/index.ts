// Edge Function: send-lifecycle-email
//
// Pipeline : pg_cron/pg_net → claim_lifecycle_emails → revalidate → Resend → complete.
// Auth HTTP : header X-Lifecycle-Email-Dispatch-Secret.
// Mode DRY_RUN / LIFECYCLE_EMAIL_DRY_RUN=true : aucun appel Resend réel.
// Isolation Auth : n’utilise pas les templates Supabase Auth ni le pipeline Resend web d’auth.

import { createClient, type SupabaseClient } from '../_shared/supabaseClient.ts';
import { resolveLifecycleProviderTransport } from '../_shared/providerTransport.ts';
import {
  lifecycleCampaignSubject,
  renderLifecycleEmailHtml,
  renderLifecycleEmailText,
  resolveLifecycleRenderCta,
} from '../_shared/lifecycleTemplates.ts';

type CampaignId = 'welcome_h0' | 'first_listing_h24' | 'abandoned_draft_h24';

type ClaimedRow = {
  id: string;
  user_id: string;
  campaign_id: CampaignId;
  occurrence_key: string;
  recipient_email: string;
  attempts: number;
  metadata: Record<string, unknown>;
};

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

function secretsEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let i = 0; i < left.length; i += 1) {
    mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
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

async function completeClaim(
  admin: SupabaseClient,
  claimId: string,
  ids: string[],
  outcome: string,
  providerMessageId: string | null,
  error: string | null
): Promise<void> {
  if (ids.length === 0) return;
  const { error: rpcError } = await admin.rpc('complete_lifecycle_email_claim', {
    p_claim_id: claimId,
    p_outbox_ids: ids,
    p_outcome: outcome,
    p_provider_message_id: providerMessageId,
    p_error: error,
  });
  if (rpcError) throw new Error(`complete_claim_failed:${outcome}`);
}

type ProviderResult =
  | { kind: 'ok'; messageId: string }
  | { kind: 'rejected'; retryable: boolean; error: string }
  | { kind: 'uncertain'; error: string };

async function sendViaResend(args: {
  dryRun: boolean;
  apiKey: string;
  baseUrl: string | null;
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  unsubUrl: string;
}): Promise<ProviderResult> {
  if (args.dryRun) {
    return { kind: 'ok', messageId: `dry_run_${crypto.randomUUID()}` };
  }
  if (!args.baseUrl) {
    return {
      kind: 'rejected',
      retryable: false,
      error: 'provider_transport_blocked',
    };
  }
  if (!args.apiKey || args.apiKey.startsWith('mock_') || args.apiKey === 'test') {
    return {
      kind: 'rejected',
      retryable: false,
      error: 'resend_api_key_blocked_in_safe_mode',
    };
  }

  let requestLikelySent = false;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    requestLikelySent = true;
    const resp = await fetch(`${args.baseUrl}/emails`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${args.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: args.from,
        to: [args.to],
        subject: args.subject,
        html: args.html,
        text: args.text,
        headers: {
          'List-Unsubscribe': `<${args.unsubUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          Precedence: 'bulk',
        },
        // Jamais category=transactional / auth / magic_link.
        tags: [
          { name: 'category', value: 'marketing' },
          { name: 'product', value: 'youmbia_lifecycle_p0' },
        ],
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!resp.ok) {
      const errText = await resp.text().catch(() => 'resend_http_error');
      const retryable = resp.status === 408 || resp.status === 429 || resp.status >= 500;
      return { kind: 'rejected', retryable, error: errText.slice(0, 500) };
    }
    const body = (await resp.json()) as { id?: string };
    if (!body.id) return { kind: 'uncertain', error: 'resend_ok_without_id' };
    return { kind: 'ok', messageId: body.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'resend_transport_error';
    if (requestLikelySent) return { kind: 'uncertain', error: message };
    return { kind: 'rejected', retryable: true, error: message };
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return json(405, { error: 'method_not_allowed' });
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
  const SERVICE_ROLE_KEY = readDefaultSecretKey();
  const DISPATCH_SECRET = Deno.env.get('LIFECYCLE_EMAIL_DISPATCH_SECRET') ?? '';
  const HMAC_SECRET = Deno.env.get('LIFECYCLE_EMAIL_HMAC_SECRET') ?? '';
  const RESEND_API_KEY = Deno.env.get('LIFECYCLE_RESEND_API_KEY') ?? '';
  const FROM_EMAIL =
    Deno.env.get('LIFECYCLE_FROM_EMAIL') ?? 'YOUMBIA <no-reply@mail.youmbia.com>';
  const PUBLIC_FUNCTIONS_BASE =
    Deno.env.get('LIFECYCLE_PUBLIC_FUNCTIONS_BASE') ??
    `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1`;
  // Fail-closed : dry_run par défaut ; mock|live uniquement via LIFECYCLE_EMAIL_TRANSPORT.
  const transport = resolveLifecycleProviderTransport({
    allowLive: Deno.env.get('LIFECYCLE_EMAIL_ALLOW_LIVE') ?? '',
    dryRun: Deno.env.get('LIFECYCLE_EMAIL_DRY_RUN') ?? '',
    dryRunAlias: Deno.env.get('DRY_RUN') ?? '',
    transport: Deno.env.get('LIFECYCLE_EMAIL_TRANSPORT') ?? '',
    isolation: Deno.env.get('LIFECYCLE_EMAIL_ISOLATION') ?? '',
    baseUrl: Deno.env.get('LIFECYCLE_RESEND_BASE_URL') ?? '',
    liveProvider: Deno.env.get('LIFECYCLE_EMAIL_LIVE_PROVIDER') ?? '',
  });
  const dryRun = transport.mode === 'dry_run';
  const providerBaseUrl =
    transport.mode === 'mock' || transport.mode === 'live' ? transport.baseUrl : null;

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !DISPATCH_SECRET || !HMAC_SECRET) {
    return json(500, { error: 'server_misconfigured' });
  }
  if (transport.mode === 'blocked') {
    return json(500, { error: 'provider_transport_blocked', detail: transport.error });
  }

  const provided = String(req.headers.get('X-Lifecycle-Email-Dispatch-Secret') ?? '').trim();
  if (!provided || !secretsEqual(provided, DISPATCH_SECRET)) {
    return json(401, { error: 'unauthorized' });
  }

  // Corps vide ou {} uniquement — pas de destinataires client.
  let body: Record<string, unknown> = {};
  try {
    const raw = await req.text();
    if (raw && raw.trim()) {
      body = JSON.parse(raw) as Record<string, unknown>;
    }
  } catch {
    return json(400, { error: 'invalid_body' });
  }
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    const keys = Object.keys(body);
    if (keys.length > 0) {
      return json(400, { error: 'unexpected_field' });
    }
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const claimId = crypto.randomUUID();
  const { data: claimedRows, error: claimError } = await admin.rpc('claim_lifecycle_emails', {
    p_claim_id: claimId,
    p_limit: 20,
  });
  if (claimError) return json(500, { error: 'claim_failed' });

  const claimed = (claimedRows ?? []) as ClaimedRow[];
  if (claimed.length === 0) {
    return json(200, { ok: true, skipped: 'no_claim', dry_run: dryRun });
  }

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  let uncertain = 0;

  for (const row of claimed) {
    try {
      const { data: eligibility, error: eligError } = await admin.rpc(
        'revalidate_lifecycle_send_eligibility',
        { p_outbox_id: row.id }
      );
      if (eligError) {
        await completeClaim(admin, claimId, [row.id], 'released', null, 'revalidate_failed');
        failed += 1;
        continue;
      }
      const elig = Array.isArray(eligibility) ? eligibility[0] : eligibility;
      if (!elig || elig.ok !== true) {
        await completeClaim(
          admin,
          claimId,
          [row.id],
          'skipped',
          null,
          String(elig?.skip_reason ?? 'ineligible')
        );
        await admin.rpc('log_lifecycle_email_event', {
          p_outbox_id: row.id,
          p_user_id: row.user_id,
          p_campaign_id: row.campaign_id,
          p_event_type: 'skipped',
          p_payload: { reason: elig?.skip_reason ?? 'ineligible' },
        });
        skipped += 1;
        continue;
      }

      const recipient = String(elig.recipient_email ?? row.recipient_email);
      const ts = String(Math.floor(Date.now() / 1000));
      const sig = await hmacHex(HMAC_SECRET, `${row.user_id}|${recipient}|${ts}`);
      const unsubUrl =
        `${PUBLIC_FUNCTIONS_BASE}/lifecycle-email-unsubscribe` +
        `?uid=${encodeURIComponent(row.user_id)}` +
        `&email=${encodeURIComponent(recipient)}` +
        `&ts=${encodeURIComponent(ts)}` +
        `&sig=${encodeURIComponent(sig)}`;

      const listingTitle =
        typeof row.metadata?.listing_title === 'string' ? row.metadata.listing_title : null;

      const { data: profile } = await admin
        .from('profiles')
        .select('full_name')
        .eq('id', row.user_id)
        .maybeSingle();

      const cta = resolveLifecycleRenderCta(row.campaign_id, { dryRun });
      const renderInput = {
        campaignId: row.campaign_id,
        fullName: profile?.full_name ?? null,
        cta: { href: cta.href, label: cta.label, enabled: cta.enabled },
        unsubscribeUrl: unsubUrl,
        listingTitle,
        webFallbackUrl: cta.webFallbackUrl,
      };
      const html = renderLifecycleEmailHtml(renderInput);
      const text = renderLifecycleEmailText(renderInput);
      const subject = lifecycleCampaignSubject(row.campaign_id);

      const result = await sendViaResend({
        dryRun,
        apiKey: RESEND_API_KEY,
        baseUrl: providerBaseUrl,
        from: FROM_EMAIL,
        to: recipient,
        subject,
        html,
        text,
        unsubUrl,
      });

      if (result.kind === 'ok' && dryRun) {
        // Dry-run : defer (pending + scheduled_for +100y) — occurrence non brûlée, pas de boucle cron.
        const { error: deferError } = await admin.rpc('defer_lifecycle_email_after_dry_run', {
          p_claim_id: claimId,
          p_outbox_ids: [row.id],
          p_mock_id: result.messageId,
        });
        if (deferError) {
          await completeClaim(
            admin,
            claimId,
            [row.id],
            'released',
            null,
            'dry_run_defer_failed'
          );
        }
        await admin.rpc('log_lifecycle_email_event', {
          p_outbox_id: row.id,
          p_user_id: row.user_id,
          p_campaign_id: row.campaign_id,
          p_event_type: 'skipped',
          p_payload: { reason: 'dry_run_deferred', mock_id: result.messageId },
        });
        skipped += 1;
      } else if (result.kind === 'ok') {
        await completeClaim(admin, claimId, [row.id], 'sent', result.messageId, null);
        await admin.rpc('log_lifecycle_email_event', {
          p_outbox_id: row.id,
          p_user_id: row.user_id,
          p_campaign_id: row.campaign_id,
          p_event_type: 'sent',
          p_payload: { provider_message_id: result.messageId, dry_run: false },
        });
        sent += 1;
      } else if (result.kind === 'uncertain') {
        await completeClaim(admin, claimId, [row.id], 'uncertain', null, result.error);
        await admin.rpc('log_lifecycle_email_event', {
          p_outbox_id: row.id,
          p_user_id: row.user_id,
          p_campaign_id: row.campaign_id,
          p_event_type: 'uncertain',
          p_payload: { error: result.error },
        });
        uncertain += 1;
      } else {
        const outcome = result.retryable ? 'failed' : 'skipped';
        await completeClaim(admin, claimId, [row.id], outcome, null, result.error);
        failed += 1;
      }
    } catch {
      try {
        await completeClaim(admin, claimId, [row.id], 'released', null, 'worker_exception');
      } catch {
        /* stale reclaim after 10 min */
      }
      failed += 1;
    }
  }

  return json(200, {
    ok: true,
    dry_run: dryRun,
    transport: transport.mode,
    claimed: claimed.length,
    sent,
    skipped,
    failed,
    uncertain,
  });
});
