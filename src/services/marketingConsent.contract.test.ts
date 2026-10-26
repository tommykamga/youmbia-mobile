import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MARKETING_CONSENT_COPY, MARKETING_CONSENT_VERSION } from '@/lib/marketingConsentVersion';

const migration = readFileSync(
  resolve('supabase/migrations/20261026120000_verified_marketing_email_consent.sql'),
  'utf8'
);

describe('contrat SQL de consentement marketing', () => {
  it('enregistre une preuve atomique à partir de auth.uid() avec une date PostgreSQL', () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.marketing_consent_record_internal/);
    expect(migration).toMatch(/v_user_id uuid := auth\.uid\(\)/);
    expect(migration).toMatch(/SECURITY DEFINER\s+SET search_path = ''/);
    expect(migration).toMatch(/FOR UPDATE/);
    expect(migration).toMatch(/clock_timestamp\(\)/);
    expect(migration).toMatch(/INSERT INTO public\.marketing_consent_events/);
  });

  it('retire les écritures directes du client sur le consentement', () => {
    expect(migration).toMatch(/REVOKE INSERT, UPDATE ON TABLE public\.email_preferences FROM authenticated/);
    expect(migration).toMatch(/GRANT UPDATE \(optional_draft_reminders_opt_out\)/);
    expect(migration).toMatch(/GRANT INSERT \(user_id, optional_draft_reminders_opt_out\)/);
    expect(migration).toMatch(/REVOKE UPDATE \(marketing_opt_in, marketing_opt_in_at, marketing_opt_in_source, marketing_opt_in_version, unsubscribed_at\)/);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.set_marketing_consent_from_settings[\s\S]*TO authenticated/);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.marketing_consent_record_internal\(boolean, text, text\) FROM PUBLIC, anon, authenticated, service_role/);
  });

  it('n’invente pas d’événements historiques et ignore les versions antérieures', () => {
    expect(migration).not.toMatch(/INSERT INTO public\.marketing_consent_events\s*\([^;]*\)\s*SELECT/i);
    expect(migration).toMatch(/marketing_opt_in_version = '2026-10-26\.v1'/);
    expect(migration).toMatch(/marketing_opt_in_version text;/);
    expect(migration).toMatch(/marketing_opt_in_source = 'authenticated_user_action'/);
    expect(migration).not.toMatch(/marketing_opt_in_source IN \('signup', 'settings', 'mobile_home_prompt'\)/);
  });

  it('lie la version serveur à la copie exacte affichée dans l’application', () => {
    expect(migration).toContain(`${MARKETING_CONSENT_VERSION} = ${MARKETING_CONSENT_COPY}`);
  });

  it('sépare les rôles anon et authenticated du journal d’audit', () => {
    expect(migration).toMatch(/REVOKE ALL ON TABLE public\.marketing_consent_events FROM PUBLIC, anon, authenticated, service_role/);
    expect(migration).toMatch(/GRANT SELECT ON TABLE public\.marketing_consent_events TO service_role/);
  });

  it('journalise les déclarations téléphoniques comme attestations administratives de cohorte uniquement', () => {
    const tableStart = migration.indexOf('CREATE TABLE IF NOT EXISTS public.marketing_consent_admin_attestations');
    const tableEnd = migration.indexOf('CREATE OR REPLACE FUNCTION public.admin_record_phone_consent_cohort_attestation()', tableStart);
    const adminTable = migration.slice(tableStart, tableEnd);
    expect(adminTable).toContain('recorded_by_admin_id uuid NOT NULL');
    expect(adminTable).toContain('attested_at timestamptz NOT NULL DEFAULT clock_timestamp()');
    expect(adminTable).not.toMatch(/user_id|original_consent_at|signature/i);
    expect(migration).toMatch(/IF v_actor IS NULL OR NOT public\.is_admin\(\) THEN/);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.admin_record_phone_consent_cohort_attestation\(\) TO authenticated/);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.admin_record_phone_consent_cohort_attestation\(\) FROM PUBLIC, anon, service_role/);
    const eligibilityStart = migration.indexOf('CREATE OR REPLACE FUNCTION public.lifecycle_has_verifiable_marketing_consent');
    const eligibilityEnd = migration.indexOf('$function$;', eligibilityStart + 1);
    const eligibilityFunction = migration.slice(eligibilityStart, eligibilityEnd);
    expect(eligibilityFunction).not.toContain('marketing_consent_admin_attestations');
  });

  it('expose au MCC uniquement un résumé agrégé et vérifie l’administrateur côté base', () => {
    const summaryStart = migration.indexOf('CREATE OR REPLACE FUNCTION public.admin_get_marketing_consent_cohort_summary()');
    const summaryEnd = migration.indexOf('$function$;', summaryStart + 1);
    const summaryFunction = migration.slice(summaryStart, summaryEnd);
    const returnedColumns = summaryFunction.match(/RETURNS TABLE \(([\s\S]*?)\)/i)?.[1] ?? '';
    expect(summaryFunction).toContain('SET search_path = \'\'');
    expect(summaryFunction).toContain('IF v_actor IS NULL OR NOT public.is_admin() THEN');
    expect(returnedColumns).not.toMatch(/user_id|email/i);
    expect(returnedColumns).toContain('active_declared_preferences integer');
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.admin_get_marketing_consent_cohort_summary\(\) FROM PUBLIC, anon, service_role/);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.admin_get_marketing_consent_cohort_summary\(\) TO authenticated/);
  });

  it('attribue une source générique côté serveur aux RPC auth', () => {
    expect(migration.match(/marketing_consent_record_internal\(p_opted_in, 'authenticated_user_action', p_consent_version\)/g)).toHaveLength(3);
    expect(migration).toMatch(/p_source IS DISTINCT FROM 'authenticated_user_action'/);
  });

  it('ne permet pas aux métadonnées publiques Auth de fabriquer un accord', () => {
    const triggerStart = migration.indexOf('CREATE OR REPLACE FUNCTION public.handle_new_user_email_preferences()');
    const triggerEnd = migration.indexOf('REVOKE ALL ON FUNCTION public.handle_new_user_email_preferences()', triggerStart);
    const trigger = migration.slice(triggerStart, triggerEnd);
    expect(trigger).not.toMatch(/raw_user_meta_data|marketing_consent_events/);
    expect(trigger).toMatch(/VALUES \(NEW\.id, false\)/);
  });

  it('enregistre seulement l’horodatage PostgreSQL pour l’inscription avec session via la RPC authentifiée', () => {
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.set_marketing_consent_from_signup\(boolean, text\) TO authenticated/);
    expect(migration).toMatch(/v_user_id uuid := auth\.uid\(\)/);
  });

  it('journalise aussi le désabonnement marketing existant sans accès client', () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.apply_lifecycle_unsubscribe/);
    expect(migration).toMatch(/'revoked', 'email_unsubscribe', v_consent_version/);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.apply_lifecycle_unsubscribe\(uuid, text, text\) TO service_role/);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.apply_lifecycle_unsubscribe\(uuid, text, text\) FROM PUBLIC, anon, authenticated/);
  });
});
