import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261017150000_lifecycle_email_p0.sql'),
  'utf8'
);
const sqlLot02 = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261017160000_lifecycle_email_p0_lot02_guards.sql'),
  'utf8'
);
const sendEdge = readFileSync(
  resolve(process.cwd(), 'supabase/functions/send-lifecycle-email/index.ts'),
  'utf8'
);
const unsubEdge = readFileSync(
  resolve(process.cwd(), 'supabase/functions/lifecycle-email-unsubscribe/index.ts'),
  'utf8'
);
const webhookEdge = readFileSync(
  resolve(process.cwd(), 'supabase/functions/lifecycle-email-webhook/index.ts'),
  'utf8'
);

describe('lifecycle email P0 — contrat SQL / Edge', () => {
  it('crée tables prefs, suppressions, outbox, events, attribution, kill switch', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.email_preferences/);
    expect(sql).toMatch(/marketing_opt_in boolean NOT NULL DEFAULT false/);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.email_suppressions/);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.lifecycle_email_outbox/);
    expect(sql).toMatch(/UNIQUE \(user_id, campaign_id, occurrence_key\)/);
    expect(sql).toMatch(/'uncertain'/);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.lifecycle_email_events/);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.email_attribution_sessions/);
    expect(sql).toMatch(/lifecycle_email_kill_switch/);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.app_runtime_flags/);
    expect(sql).toMatch(
      /VALUES \('lifecycle_email_kill_switch', 'true'\)/
    );
  });

  it('RLS deny-by-default + SECURITY DEFINER search_path vide', () => {
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/REVOKE ALL ON TABLE public\.lifecycle_email_outbox FROM authenticated/);
    expect(sql).toMatch(/REVOKE ALL ON TABLE public\.email_suppressions FROM authenticated/);
    expect(sql).toMatch(/email_preferences_select_own/);
    expect(sql).toMatch(/user_id = \(SELECT auth\.uid\(\)\)/);
    expect(sql).toMatch(/SECURITY DEFINER\s+SET search_path = ''/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.claim_lifecycle_emails\(uuid, integer\) TO service_role/);
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.claim_lifecycle_emails\(uuid, integer\) FROM authenticated/
    );
  });

  it('enqueue campagnes + fréquence 7j + claim SKIP LOCKED + suppressions', () => {
    expect(sql).toMatch(/welcome_h0/);
    expect(sql).toMatch(/first_listing_h24/);
    expect(sql).toMatch(/abandoned_draft_h24/);
    expect(sql).toMatch(/interval '7 days'/);
    expect(sql).toMatch(/last_published_at IS NOT NULL/);
    expect(sql).toMatch(/l\.status = 'draft'/);
    expect(sql).toMatch(/FOR UPDATE SKIP LOCKED/);
    expect(sql).toMatch(/revalidate_lifecycle_send_eligibility/);
    expect(sql).toMatch(/complete_lifecycle_email_claim/);
    expect(sql).toMatch(/p_outcome = 'uncertain'/);
    expect(sql).toMatch(/lifecycle_email_is_suppressed/);
    expect(sql).toMatch(/marketing_opt_in IS TRUE/);
    expect(sql).toMatch(/coalesce\(prof\.is_banned, false\) = false/);
    expect(sql).toMatch(/ON CONFLICT \(user_id, campaign_id, occurrence_key\) DO NOTHING/);
    expect(sql).toMatch(/interval '10 minutes'/);
    expect(sql).toMatch(/attempts >= max_attempts/);
  });

  it('consentement défaut false + revalidation au send', () => {
    expect(sql).toMatch(/marketing_opt_in boolean NOT NULL DEFAULT false/);
    expect(sql).toMatch(/VALUES \(NEW\.id, false\)/);
    expect(sql).toMatch(/pref\.marketing_opt_in IS NOT TRUE OR pref\.unsubscribed_at IS NOT NULL/);
    expect(sql).toMatch(/'no_consent'/);
    expect(sql).toMatch(/'suppressed'/);
    expect(sql).toMatch(/'frequency_cap'/);
    expect(sql).toMatch(/'banned'/);
  });

  it('Lot 02 : metadata signup opt-in + claim refuse provider_message_id stale + dry_run defer', () => {
    expect(sqlLot02).toMatch(/marketing_opt_in', 'false'\)\) = 'true'/);
    expect(sqlLot02).toMatch(/stale_claim_with_provider_id/);
    expect(sqlLot02).toMatch(/o\.provider_message_id IS NULL/);
    expect(sqlLot02).toMatch(/o\.provider_message_id IS NOT NULL/);
    expect(sqlLot02).toMatch(/defer_lifecycle_email_after_dry_run/);
    expect(sqlLot02).toMatch(/interval '100 years'/);
  });

  it('ne schedule cron que via SQL versionné (pas d’auth email)', () => {
    expect(sql).toMatch(/enqueue-lifecycle-emails/);
    expect(sql).toMatch(/dispatch-lifecycle-emails/);
    expect(sql).toMatch(/X-Lifecycle-Email-Dispatch-Secret/);
    expect(sql).not.toMatch(/auth-email-links/);
    expect(sql).not.toMatch(/generateLink/);
  });

  it('Edge send : secret header, dry-run safe-by-default, pas de JWT user, uncertain', () => {
    expect(sendEdge).toMatch(/X-Lifecycle-Email-Dispatch-Secret/);
    expect(sendEdge).toMatch(/LIFECYCLE_EMAIL_ALLOW_LIVE/);
    expect(sendEdge).toMatch(/LIFECYCLE_EMAIL_DRY_RUN/);
    expect(sendEdge).toMatch(/defer_lifecycle_email_after_dry_run/);
    expect(sendEdge).toMatch(/dry_run_deferred/);
    expect(sendEdge).toMatch(/claim_lifecycle_emails/);
    expect(sendEdge).toMatch(/revalidate_lifecycle_send_eligibility/);
    expect(sendEdge).toMatch(/uncertain/);
    expect(sendEdge).toMatch(/SUPABASE_SECRET_KEYS/);
    expect(sendEdge).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(sendEdge).not.toMatch(/getUser\(/);
    expect(sendEdge).toMatch(/unexpected_field/);
    expect(sendEdge).toMatch(/List-Unsubscribe/);
    expect(sendEdge).toMatch(/category', value: 'marketing'/);
    expect(sendEdge).not.toMatch(/category', value: 'transactional'/);
    expect(sendEdge).not.toMatch(/category', value: 'auth'/);
    expect(sendEdge).toMatch(/Communication marketing/);
    expect(sendEdge).toMatch(/Precedence: 'bulk'/);
    expect(sendEdge).toMatch(/\/annonce\/\$\{encodeURIComponent\(listingId\)\}/);
  });

  it('Edge unsub : GET non mutatif ; POST applique ; webhook signature invalide → 401', () => {
    expect(unsubEdge).toMatch(/LIFECYCLE_EMAIL_HMAC_SECRET/);
    expect(unsubEdge).toMatch(/invalid_signature/);
    expect(unsubEdge).toMatch(/Confirmer la désinscription/);
    expect(unsubEdge).toMatch(/req\.method === 'GET'/);
    expect(unsubEdge).toMatch(/apply_lifecycle_unsubscribe/);
    const getIdx = unsubEdge.indexOf("if (req.method === 'GET')");
    const applyIdx = unsubEdge.indexOf('apply_lifecycle_unsubscribe');
    expect(getIdx).toBeGreaterThan(-1);
    expect(applyIdx).toBeGreaterThan(getIdx);
    expect(webhookEdge).toMatch(/LIFECYCLE_RESEND_WEBHOOK_SECRET/);
    expect(webhookEdge).toMatch(/invalid_signature/);
    expect(webhookEdge).toMatch(/email_suppressions/);
    expect(webhookEdge).toMatch(/hard_bounce/);
  });
});

describe('lifecycle email P0 — isolation Auth (non-régression)', () => {
  it('ne modifie pas les sources Auth Magic Link / signup patterns du dépôt', () => {
    const authDeepLink = readFileSync(
      resolve(process.cwd(), 'src/services/auth/handleSupabaseAuthDeepLink.ts'),
      'utf8'
    );
    const magicDoc = readFileSync(
      resolve(process.cwd(), 'docs/SUPABASE_MAGIC_LINK_AND_REDIRECTS.md'),
      'utf8'
    );
    expect(authDeepLink).toMatch(/verifyOtp|exchangeCodeForSession|setSession/);
    expect(magicDoc).toMatch(/Magic Link/);
    expect(sendEdge).not.toMatch(/handleSupabaseAuthDeepLink/);
    expect(sendEdge).not.toMatch(/signInWithOtp/);
    expect(unsubEdge).not.toMatch(/signInWithOtp/);
    expect(webhookEdge).not.toMatch(/signInWithOtp/);
  });

  it('branche lifecycle n’importe pas Resend Auth web', () => {
    expect(sendEdge).not.toMatch(/from ['"].*auth-email-links/);
    expect(sendEdge).not.toMatch(/getResend\(/);
    expect(sendEdge).toMatch(/LIFECYCLE_RESEND_API_KEY/);
  });

  it('garde baseline marketplace avant INSERT categories (pas de stub)', () => {
    const baselineGuard = readFileSync(
      resolve(
        process.cwd(),
        'supabase/migrations/20260514100000_require_marketplace_baseline.sql'
      ),
      'utf8'
    );
    expect(baselineGuard).toMatch(/baseline_schema_missing/);
    expect(baselineGuard).toMatch(/to_regclass\('public\.categories'\)/);
    expect(baselineGuard).not.toMatch(/CREATE TABLE[\s\S]*categories/i);
  });
});
