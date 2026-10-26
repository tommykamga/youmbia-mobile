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
  });

  it('lie la version serveur à la copie exacte affichée dans l’application', () => {
    expect(migration).toContain(`${MARKETING_CONSENT_VERSION} = ${MARKETING_CONSENT_COPY}`);
  });

  it('sépare les rôles anon et authenticated du journal d’audit', () => {
    expect(migration).toMatch(/REVOKE ALL ON TABLE public\.marketing_consent_events FROM PUBLIC, anon, authenticated, service_role/);
    expect(migration).toMatch(/GRANT SELECT ON TABLE public\.marketing_consent_events TO service_role/);
  });

  it('fixe la source de chaque RPC côté serveur', () => {
    expect(migration).toMatch(/marketing_consent_record_internal\(p_opted_in, 'signup', p_consent_version\)/);
    expect(migration).toMatch(/marketing_consent_record_internal\(p_opted_in, 'settings', p_consent_version\)/);
    expect(migration).toMatch(/marketing_consent_record_internal\(p_opted_in, 'mobile_home_prompt', p_consent_version\)/);
  });

  it('journalise aussi le désabonnement marketing existant sans accès client', () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.apply_lifecycle_unsubscribe/);
    expect(migration).toMatch(/'revoked', 'email_unsubscribe', v_consent_version/);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.apply_lifecycle_unsubscribe\(uuid, text, text\) TO service_role/);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.apply_lifecycle_unsubscribe\(uuid, text, text\) FROM PUBLIC, anon, authenticated/);
  });
});
