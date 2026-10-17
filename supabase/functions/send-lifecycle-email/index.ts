// Edge Function: send-lifecycle-email
//
// Pipeline : pg_cron/pg_net → claim_lifecycle_emails → revalidate → Resend → complete.
// Auth HTTP : header X-Lifecycle-Email-Dispatch-Secret.
// Mode DRY_RUN / LIFECYCLE_EMAIL_DRY_RUN=true : aucun appel Resend réel.
// Isolation Auth : n’utilise pas les templates Supabase Auth ni le pipeline Resend web d’auth.

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.99.3';

const BRAND_GREEN = '#16A34A';
const BRAND_NAVY = '#0F172A';
const BG = '#F8FAFC';
const LOGO = 'https://www.youmbia.com/brand/youmbia-logo-header.svg';
const WEB_ORIGIN = 'https://www.youmbia.com';

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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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

function subjectFor(campaignId: CampaignId): string {
  if (campaignId === 'welcome_h0') return 'Bienvenue sur YOUMBIA';
  if (campaignId === 'first_listing_h24') return 'Publiez votre première annonce sur YOUMBIA';
  return 'Votre brouillon vous attend sur YOUMBIA';
}

/** Aligné src/lib/lifecycleEmail/httpsRoutes.ts — CTA email toujours HTTPS. */
function resolveCta(
  campaignId: CampaignId,
  dryRun: boolean,
  listingId: string | null
): { href: string | null; label: string; enabled: boolean } {
  const home = `${WEB_ORIGIN}/`;
  if (campaignId === 'welcome_h0') {
    return { href: home, label: 'Découvrir YOUMBIA', enabled: true };
  }
  if (campaignId === 'first_listing_h24') {
    if (dryRun) {
      return { href: null, label: 'Publier une annonce', enabled: false };
    }
    return { href: home, label: 'Publier une annonce', enabled: true };
  }
  // abandoned_draft_h24 — Universal Link /annonce/{id} si listing connu
  if (listingId && !dryRun) {
    const annonce = `${WEB_ORIGIN}/annonce/${encodeURIComponent(listingId)}`;
    return { href: annonce, label: 'Ouvrir YOUMBIA', enabled: true };
  }
  if (dryRun) {
    return { href: null, label: 'Reprendre mon brouillon', enabled: false };
  }
  return { href: home, label: 'Ouvrir YOUMBIA', enabled: true };
}

function renderHtml(args: {
  campaignId: CampaignId;
  fullName: string | null;
  cta: { href: string | null; label: string; enabled: boolean };
  unsubscribeUrl: string;
  listingTitle: string | null;
}): string {
  const subject = subjectFor(args.campaignId);
  const name = (args.fullName ?? '').trim();
  const greet = name ? `Bonjour ${escapeHtml(name)},` : 'Bonjour,';
  let body =
    'Bienvenue sur YOUMBIA, le marché qui vous élève. Explorez les annonces près de chez vous.';
  if (args.campaignId === 'first_listing_h24') {
    body =
      'Vous n’avez pas encore publié d’annonce. En quelques minutes, mettez en avant un article et rejoignez la communauté.';
  } else if (args.campaignId === 'abandoned_draft_h24') {
    const title = (args.listingTitle ?? '').trim();
    body =
      title && title !== 'Brouillon'
        ? `Votre brouillon « ${escapeHtml(title)} » est toujours en attente. Reprenez-le pour le publier.`
        : 'Votre brouillon d’annonce est toujours en attente. Reprenez-le pour le publier.';
  }
  const ctaBlock =
    args.cta.enabled && args.cta.href
      ? `<div style="text-align:center;margin:28px 0;">
        <a href="${escapeHtml(args.cta.href)}" style="background:${BRAND_GREEN};color:#fff;text-decoration:none;padding:14px 24px;border-radius:10px;font-weight:bold;font-size:16px;display:inline-block;">${escapeHtml(args.cta.label)}</a>
      </div>`
      : '';

  return `<!DOCTYPE html><html lang="fr"><body style="margin:0;padding:0;background:${BG};font-family:Arial,sans-serif;color:${BRAND_NAVY};">
  <div style="max-width:640px;margin:0 auto;padding:28px 16px;">
    <div style="background:#fff;border-radius:18px;padding:32px;border:1px solid #E2E8F0;">
      <div style="text-align:center;margin-bottom:28px;"><img src="${LOGO}" alt="YOUMBIA" style="height:46px;max-width:180px;"/></div>
      <p style="font-size:16px;line-height:1.6;">${greet}</p>
      <h1 style="font-size:22px;color:${BRAND_GREEN};">${escapeHtml(subject)}</h1>
      <p style="font-size:16px;line-height:1.6;">${body}</p>
      ${ctaBlock}
      <p style="font-size:14px;color:#475569;"><strong>L’équipe YOUMBIA</strong><br/>Le marché qui vous élève</p>
    </div>
    <p style="text-align:center;font-size:12px;color:#64748B;margin-top:16px;">
      Communication marketing (pas un e-mail de connexion).
      <a href="${escapeHtml(args.unsubscribeUrl)}" style="color:#64748B;">Se désinscrire</a>
    </p>
  </div></body></html>`;
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
    const resp = await fetch('https://api.resend.com/emails', {
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
  // Envoi live uniquement si ALLOW_LIVE=true explicite. Sinon dry-run (aucun Resend réel).
  const allowLive =
    String(Deno.env.get('LIFECYCLE_EMAIL_ALLOW_LIVE') ?? '').toLowerCase() === 'true';
  const dryRunEnv =
    String(Deno.env.get('LIFECYCLE_EMAIL_DRY_RUN') ?? '').toLowerCase() === 'true' ||
    String(Deno.env.get('DRY_RUN') ?? '').toLowerCase() === 'true';
  const dryRun = !allowLive || dryRunEnv;

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !DISPATCH_SECRET || !HMAC_SECRET) {
    return json(500, { error: 'server_misconfigured' });
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

      const listingId =
        typeof row.metadata?.listing_id === 'string'
          ? row.metadata.listing_id
          : row.occurrence_key || null;
      const listingTitle =
        typeof row.metadata?.listing_title === 'string' ? row.metadata.listing_title : null;

      const { data: profile } = await admin
        .from('profiles')
        .select('full_name')
        .eq('id', row.user_id)
        .maybeSingle();

      const cta = resolveCta(row.campaign_id, dryRun, listingId);
      const html = renderHtml({
        campaignId: row.campaign_id,
        fullName: profile?.full_name ?? null,
        cta,
        unsubscribeUrl: unsubUrl,
        listingTitle,
      });
      const text = `${subjectFor(row.campaign_id)}\n\nSe désinscrire : ${unsubUrl}`;

      const result = await sendViaResend({
        dryRun,
        apiKey: RESEND_API_KEY,
        from: FROM_EMAIL,
        to: recipient,
        subject: subjectFor(row.campaign_id),
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
    claimed: claimed.length,
    sent,
    skipped,
    failed,
    uncertain,
  });
});
