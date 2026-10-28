-- Local-only synthetic fixture, on top of transactional_push_fixture.sql.
-- Helper stubs model external lifecycle dependencies, not full Supabase Auth.
\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',label; END IF; END $$;
CREATE TABLE public.email_preferences (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id), marketing_opt_in boolean NOT NULL DEFAULT false,
 marketing_opt_in_at timestamptz, marketing_opt_in_source text, unsubscribed_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now(), optional_draft_reminders_opt_out boolean NOT NULL DEFAULT false,
 draft_reminders_notice_acknowledged_at timestamptz
);
ALTER TABLE public.email_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_select ON public.email_preferences FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE POLICY own_insert ON public.email_preferences FOR INSERT TO authenticated WITH CHECK(user_id=auth.uid());
CREATE POLICY own_update ON public.email_preferences FOR UPDATE TO authenticated USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
GRANT SELECT,INSERT,UPDATE ON public.email_preferences TO authenticated,service_role;
CREATE TABLE public.email_suppressions(email text PRIMARY KEY,reason text NOT NULL,source text NOT NULL,created_at timestamptz DEFAULT now());
CREATE FUNCTION public.log_lifecycle_email_event(uuid,uuid,text,text,jsonb) RETURNS void LANGUAGE sql AS $$ SELECT $$;
CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce((SELECT raw_app_meta_data->>'role'='admin' FROM auth.users WHERE id=auth.uid()),false) $$;
CREATE FUNCTION public.lifecycle_email_is_suppressed(text) RETURNS boolean LANGUAGE sql AS $$ SELECT EXISTS(SELECT 1 FROM public.email_suppressions WHERE email=$1) $$;
CREATE FUNCTION public.lifecycle_email_user_within_frequency_cap(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
INSERT INTO auth.users(id,email) VALUES
 ('00000000-0000-4000-8000-000000000001','consent-a@ymb.invalid'),
 ('00000000-0000-4000-8000-000000000002','consent-b@ymb.invalid');
INSERT INTO email_preferences(user_id,marketing_opt_in,marketing_opt_in_source,marketing_opt_in_at)
 VALUES('00000000-0000-4000-8000-000000000002',true,'migration_initiale_youmbia_2026_10_18',now());
\ir ../migrations/20261026120000_verified_marketing_email_consent.sql
CREATE TRIGGER consent_signup AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_email_preferences();
SELECT pg_temp.assert(NOT lifecycle_has_verifiable_marketing_consent('00000000-0000-4000-8000-000000000002'),'legacy opt-in never becomes verified');
INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES('00000000-0000-4000-8000-000000000003','metadata@ymb.invalid','{"marketing_opt_in":true,"marketing_consent_version":"2026-10-26.v1"}');
SELECT pg_temp.assert(NOT (SELECT marketing_opt_in FROM email_preferences WHERE user_id='00000000-0000-4000-8000-000000000003'),'untrusted signup metadata cannot establish consent');
SET LOCAL ROLE anon;
DO $$ BEGIN
 BEGIN PERFORM public.set_marketing_consent_from_settings(true,'2026-10-26.v1'); RAISE EXCEPTION 'anon accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET LOCAL request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT * FROM set_marketing_consent_from_home_prompt(false,'2026-10-26.v1');
SELECT * FROM set_marketing_consent_from_signup(true,'2026-10-26.v1');
SELECT * FROM set_marketing_consent_from_settings(false,'2026-10-26.v1');
SELECT * FROM set_marketing_consent_from_settings(true,'2026-10-26.v1');
DO $$ BEGIN
 BEGIN UPDATE email_preferences SET marketing_opt_in=true; RAISE EXCEPTION 'direct consent write accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM set_marketing_consent_from_settings(true,'old-version'); RAISE EXCEPTION 'old version accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM * FROM admin_get_marketing_consent_cohort_summary(); RAISE EXCEPTION 'nonadmin summary accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT pg_temp.assert((SELECT count(*)=1 FROM email_preferences),'RLS own row only');
UPDATE email_preferences SET optional_draft_reminders_opt_out=true,updated_at='2000-01-01';
RESET ROLE;
SELECT pg_temp.assert(lifecycle_has_verifiable_marketing_consent('00000000-0000-4000-8000-000000000001'),'persisted consent survives draft preferences');
SELECT pg_temp.assert((SELECT array_agg(choice ORDER BY created_at)=ARRAY['refused','accepted','revoked','accepted'] FROM marketing_consent_events),'refusal acceptance withdrawal reacceptance audit');
SELECT pg_temp.assert((SELECT updated_at>'2000-01-01' FROM email_preferences WHERE user_id='00000000-0000-4000-8000-000000000001'),'server timestamp clamps legacy write');
SET LOCAL ROLE service_role;
SELECT apply_lifecycle_unsubscribe('00000000-0000-4000-8000-000000000001','consent-a@ymb.invalid','test');
RESET ROLE;
SELECT pg_temp.assert(NOT lifecycle_has_verifiable_marketing_consent('00000000-0000-4000-8000-000000000001'),'unsubscribe revokes');
SET LOCAL ROLE authenticated;
SELECT * FROM set_marketing_consent_from_settings(true,'2026-10-26.v1');
RESET ROLE;
SELECT pg_temp.assert(NOT EXISTS(SELECT 1 FROM email_suppressions),'explicit re-consent clears unsubscribe suppression');
INSERT INTO email_suppressions(email,reason,source) VALUES('consent-a@ymb.invalid','hard_bounce','test');
SET LOCAL ROLE service_role;
SELECT apply_lifecycle_unsubscribe('00000000-0000-4000-8000-000000000001','consent-a@ymb.invalid','test');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT * FROM set_marketing_consent_from_settings(true,'2026-10-26.v1');
RESET ROLE;
SELECT pg_temp.assert((SELECT reason='hard_bounce' FROM email_suppressions),'hard suppression survives unsubscribe and reconsent');
UPDATE auth.users SET raw_app_meta_data='{"role":"admin"}' WHERE id='00000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT * FROM admin_record_phone_consent_cohort_attestation();
SELECT pg_temp.assert((SELECT declaration_count=1 AND active_declared_preferences=1 FROM admin_get_marketing_consent_cohort_summary()),'admin aggregate reads without granting consent');
RESET ROLE;
SELECT pg_temp.assert(NOT lifecycle_has_verifiable_marketing_consent('00000000-0000-4000-8000-000000000002'),'admin attestation never establishes consent');
CREATE FUNCTION pg_temp.fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic_audit_failure'; END $$;
CREATE TRIGGER fail_audit BEFORE INSERT ON marketing_consent_events FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_audit();
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 BEGIN PERFORM set_marketing_consent_from_settings(false,'2026-10-26.v1'); RAISE EXCEPTION 'audit failure ignored';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'synthetic_audit_failure' THEN RAISE; END IF; END;
END $$;
RESET ROLE;
SELECT pg_temp.assert(lifecycle_has_verifiable_marketing_consent('00000000-0000-4000-8000-000000000001'),'audit failure rolls back consent atomically');
SELECT pg_temp.assert((SELECT NOT messages_enabled AND NOT favorites_enabled FROM transactional_push_config),'push still OFF');
SELECT 'PASS verified consent persistence, refusal, withdrawal, reconsent, atomicity, roles and RLS';
ROLLBACK;
