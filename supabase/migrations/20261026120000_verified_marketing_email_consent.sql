-- MCC Growth P0-01: explicit, versioned and revocable marketing email consent.
-- Additive only: lifecycle campaigns keep reading email_preferences; no flags,
-- schedules, transactional email functions, or historical consent are enabled.

ALTER TABLE public.email_preferences
  ADD COLUMN IF NOT EXISTS marketing_opt_in_version text;

COMMENT ON COLUMN public.email_preferences.marketing_opt_in_version IS
  'Version of accepted consent copy. 2026-10-26.v1 = Je souhaite recevoir par e-mail des conseils, nouveautés et recommandations YOUMBIA. Ce choix est facultatif et révocable à tout moment, sans effet sur l’utilisation de mon compte. Les e-mails transactionnels (connexion, confirmation et sécurité) restent séparés. NULL is unverified.';

-- Append-only evidence of user actions. Historical/imported preference rows are
-- deliberately not backfilled into this table.
CREATE TABLE IF NOT EXISTS public.marketing_consent_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  choice text NOT NULL CHECK (choice IN ('accepted', 'refused', 'revoked')),
  source text NOT NULL CHECK (source IN ('authenticated_user_action', 'email_unsubscribe')),
  consent_version text CHECK (consent_version IS NULL OR length(btrim(consent_version)) > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT marketing_consent_events_acceptance_version_chk
    CHECK (choice <> 'accepted' OR consent_version IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS marketing_consent_events_user_created_idx
  ON public.marketing_consent_events (user_id, created_at DESC);

COMMENT ON TABLE public.marketing_consent_events IS
  'Server-timestamped history of explicit marketing email consent decisions. No imported history is inferred.';

ALTER TABLE public.marketing_consent_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.marketing_consent_events FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.marketing_consent_events TO service_role;

-- Administrative cohort-level record for an owner's historical verbal claim.
-- It is deliberately separate from user consent events and never participates
-- in lifecycle eligibility. No call date, signature, or individual action is
-- inferred or stored here.
CREATE TABLE IF NOT EXISTS public.marketing_consent_admin_attestations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_source text NOT NULL CHECK (
    cohort_source = 'migration_initiale_youmbia_2026_10_18'
  ),
  active_preference_count integer NOT NULL CHECK (active_preference_count >= 0),
  recorded_by_admin_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  attested_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  attestation text NOT NULL CHECK (
    attestation = 'The application owner reports prior telephone marketing agreements for this legacy preference cohort; no signed or user-level evidence was provided.'
  )
);

COMMENT ON TABLE public.marketing_consent_admin_attestations IS
  'Append-only administrative record of a cohort-level owner statement. Not a user consent event and never evidence for lifecycle eligibility.';

ALTER TABLE public.marketing_consent_admin_attestations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.marketing_consent_admin_attestations FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.marketing_consent_admin_attestations TO authenticated;
DROP POLICY IF EXISTS marketing_consent_admin_attestations_admin_read
  ON public.marketing_consent_admin_attestations;
CREATE POLICY marketing_consent_admin_attestations_admin_read
  ON public.marketing_consent_admin_attestations
  FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE OR REPLACE FUNCTION public.admin_record_phone_consent_cohort_attestation()
RETURNS TABLE (
  attestation_id uuid,
  cohort_source text,
  active_preference_count integer,
  recorded_by_admin_id uuid,
  attested_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_active_count integer;
  v_attestation_id uuid := gen_random_uuid();
  v_attested_at timestamptz := clock_timestamp();
BEGIN
  IF v_actor IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin_required' USING ERRCODE = '42501';
  END IF;

  SELECT count(*)::integer INTO v_active_count
  FROM public.email_preferences AS p
  WHERE p.marketing_opt_in IS TRUE
    AND p.unsubscribed_at IS NULL
    AND p.marketing_opt_in_source = 'migration_initiale_youmbia_2026_10_18';

  RETURN QUERY
  INSERT INTO public.marketing_consent_admin_attestations (
    id, cohort_source, active_preference_count, recorded_by_admin_id, attested_at, attestation
  )
  VALUES (
    v_attestation_id,
    'migration_initiale_youmbia_2026_10_18',
    v_active_count,
    v_actor,
    v_attested_at,
    'The application owner reports prior telephone marketing agreements for this legacy preference cohort; no signed or user-level evidence was provided.'
  )
  RETURNING id, cohort_source, active_preference_count, recorded_by_admin_id, attested_at;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_record_phone_consent_cohort_attestation() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.admin_record_phone_consent_cohort_attestation() TO authenticated;

-- Remove the broad client write path that allowed a caller to forge the
-- marketing state, timestamp, source, or version. Draft-reminder preferences
-- remain independently writable and new rows retain marketing=false by default.
REVOKE INSERT, UPDATE ON TABLE public.email_preferences FROM authenticated;
REVOKE INSERT (marketing_opt_in, marketing_opt_in_at, marketing_opt_in_source, marketing_opt_in_version, unsubscribed_at)
  ON TABLE public.email_preferences FROM authenticated;
REVOKE UPDATE (marketing_opt_in, marketing_opt_in_at, marketing_opt_in_source, marketing_opt_in_version, unsubscribed_at)
  ON TABLE public.email_preferences FROM authenticated;
GRANT INSERT (user_id, optional_draft_reminders_opt_out)
  ON TABLE public.email_preferences TO authenticated;
GRANT UPDATE (optional_draft_reminders_opt_out)
  ON TABLE public.email_preferences TO authenticated;

CREATE OR REPLACE FUNCTION public.marketing_consent_record_internal(
  p_opted_in boolean,
  p_source text,
  p_consent_version text
)
RETURNS TABLE (
  marketing_opt_in boolean,
  marketing_opt_in_at timestamptz,
  marketing_opt_in_source text,
  marketing_opt_in_version text,
  unsubscribed_at timestamptz,
  optional_draft_reminders_opt_out boolean,
  draft_reminders_notice_acknowledged_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_previous_opted_in boolean := false;
  v_operation_id uuid := gen_random_uuid();
  v_occurred_at timestamptz := clock_timestamp();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_opted_in IS NULL
     OR p_source IS NULL
     OR p_source IS DISTINCT FROM 'authenticated_user_action'
     OR p_consent_version IS DISTINCT FROM '2026-10-26.v1' THEN
    RAISE EXCEPTION 'invalid marketing consent request' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.email_preferences (user_id, marketing_opt_in)
  VALUES (v_user_id, false)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT p.marketing_opt_in IS TRUE
         AND p.unsubscribed_at IS NULL
         AND p.marketing_opt_in_at IS NOT NULL
         AND p.marketing_opt_in_version = '2026-10-26.v1'
         AND p.marketing_opt_in_source = 'authenticated_user_action'
    INTO v_previous_opted_in
  FROM public.email_preferences AS p
  WHERE p.user_id = v_user_id
  FOR UPDATE;

  IF p_opted_in THEN
    -- An explicit, authenticated re-consent may clear only the prior
    -- unsubscribe suppression for the user's current address. Hard suppressions
    -- remain in force and are never removed by a consent action.
    DELETE FROM public.email_suppressions AS s
    USING auth.users AS u
    WHERE u.id = v_user_id
      AND s.email = lower(btrim(u.email))
      AND s.reason = 'unsub';

    UPDATE public.email_preferences AS p
    SET marketing_opt_in = true,
        marketing_opt_in_at = v_occurred_at,
        marketing_opt_in_source = p_source,
        marketing_opt_in_version = p_consent_version,
        unsubscribed_at = NULL
    WHERE p.user_id = v_user_id;

    INSERT INTO public.marketing_consent_events
      (operation_id, user_id, choice, source, consent_version, created_at)
    VALUES (v_operation_id, v_user_id, 'accepted', p_source, p_consent_version, v_occurred_at);
  ELSE
    UPDATE public.email_preferences AS p
    SET marketing_opt_in = false,
        marketing_opt_in_at = NULL,
        marketing_opt_in_source = p_source,
        marketing_opt_in_version = NULL,
        unsubscribed_at = v_occurred_at
    WHERE p.user_id = v_user_id;

    INSERT INTO public.marketing_consent_events
      (operation_id, user_id, choice, source, consent_version, created_at)
    VALUES (
      v_operation_id,
      v_user_id,
      CASE WHEN v_previous_opted_in THEN 'revoked' ELSE 'refused' END,
      p_source,
      p_consent_version,
      v_occurred_at
    );
  END IF;

  RETURN QUERY
  SELECT p.marketing_opt_in, p.marketing_opt_in_at, p.marketing_opt_in_source,
         p.marketing_opt_in_version, p.unsubscribed_at,
         p.optional_draft_reminders_opt_out,
         p.draft_reminders_notice_acknowledged_at
  FROM public.email_preferences AS p
  WHERE p.user_id = v_user_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.marketing_consent_record_internal(boolean, text, text) FROM PUBLIC, anon, authenticated, service_role;

-- Public RPCs share one server-fixed source. The caller cannot forge a UI
-- surface label; the authenticated RPC invocation is the recorded provenance.
CREATE OR REPLACE FUNCTION public.set_marketing_consent_from_signup(
  p_opted_in boolean,
  p_consent_version text
)
RETURNS TABLE (
  marketing_opt_in boolean,
  marketing_opt_in_at timestamptz,
  marketing_opt_in_source text,
  marketing_opt_in_version text,
  unsubscribed_at timestamptz,
  optional_draft_reminders_opt_out boolean,
  draft_reminders_notice_acknowledged_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT * FROM public.marketing_consent_record_internal(p_opted_in, 'authenticated_user_action', p_consent_version);
$function$;

CREATE OR REPLACE FUNCTION public.set_marketing_consent_from_settings(
  p_opted_in boolean,
  p_consent_version text
)
RETURNS TABLE (
  marketing_opt_in boolean,
  marketing_opt_in_at timestamptz,
  marketing_opt_in_source text,
  marketing_opt_in_version text,
  unsubscribed_at timestamptz,
  optional_draft_reminders_opt_out boolean,
  draft_reminders_notice_acknowledged_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT * FROM public.marketing_consent_record_internal(p_opted_in, 'authenticated_user_action', p_consent_version);
$function$;

CREATE OR REPLACE FUNCTION public.set_marketing_consent_from_home_prompt(
  p_opted_in boolean,
  p_consent_version text
)
RETURNS TABLE (
  marketing_opt_in boolean,
  marketing_opt_in_at timestamptz,
  marketing_opt_in_source text,
  marketing_opt_in_version text,
  unsubscribed_at timestamptz,
  optional_draft_reminders_opt_out boolean,
  draft_reminders_notice_acknowledged_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT * FROM public.marketing_consent_record_internal(p_opted_in, 'authenticated_user_action', p_consent_version);
$function$;

REVOKE ALL ON FUNCTION public.set_marketing_consent_from_signup(boolean, text) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.set_marketing_consent_from_settings(boolean, text) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.set_marketing_consent_from_home_prompt(boolean, text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.set_marketing_consent_from_signup(boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_marketing_consent_from_settings(boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_marketing_consent_from_home_prompt(boolean, text) TO authenticated;

-- The Auth sign-up metadata is client-controlled, so the trigger only provisions
-- a non-consenting row. A versioned consent is recorded later by the authenticated RPC.
CREATE OR REPLACE FUNCTION public.handle_new_user_email_preferences()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  INSERT INTO public.email_preferences (user_id, marketing_opt_in)
  VALUES (NEW.id, false)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.handle_new_user_email_preferences() FROM PUBLIC, anon, authenticated;

-- All lifecycle enqueue/dispatch eligibility continues through this one helper.
-- NULL or old versions (including migration-derived rows) are never verified.
CREATE OR REPLACE FUNCTION public.lifecycle_has_verifiable_marketing_consent(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.email_preferences AS p
    WHERE p.user_id = p_user_id
      AND p.marketing_opt_in IS TRUE
      AND p.unsubscribed_at IS NULL
      AND p.marketing_opt_in_at IS NOT NULL
      AND p.marketing_opt_in_version = '2026-10-26.v1'
      AND p.marketing_opt_in_source = 'authenticated_user_action'
  );
$function$;

REVOKE ALL ON FUNCTION public.lifecycle_has_verifiable_marketing_consent(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lifecycle_has_verifiable_marketing_consent(uuid) TO service_role;

-- Admin-only, privacy-preserving summary for the MCC historical cohort panel.
-- It returns aggregates only; individual user identifiers and email addresses
-- remain inside the function and are never used as consent evidence.
CREATE OR REPLACE FUNCTION public.admin_get_marketing_consent_cohort_summary()
RETURNS TABLE (
  cohort_source text,
  active_declared_preferences integer,
  verified_mobile_opt_ins integer,
  suppressed_declared_preferences integer,
  frequency_capped_declared_preferences integer,
  declaration_count integer,
  last_declaration_recorded_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin_required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH active_cohort AS (
    SELECT p.user_id, u.email
    FROM public.email_preferences AS p
    LEFT JOIN auth.users AS u ON u.id = p.user_id
    WHERE p.marketing_opt_in IS TRUE
      AND p.unsubscribed_at IS NULL
      AND p.marketing_opt_in_source = 'migration_initiale_youmbia_2026_10_18'
  )
  SELECT
    'migration_initiale_youmbia_2026_10_18'::text,
    (SELECT count(*)::integer FROM active_cohort),
    (SELECT count(*)::integer FROM public.email_preferences AS p
      WHERE p.marketing_opt_in IS TRUE
        AND p.unsubscribed_at IS NULL
        AND p.marketing_opt_in_at IS NOT NULL
        AND p.marketing_opt_in_version = '2026-10-26.v1'
        AND p.marketing_opt_in_source = 'authenticated_user_action'),
    (SELECT count(*)::integer FROM active_cohort AS c
      WHERE public.lifecycle_email_is_suppressed(c.email)),
    (SELECT count(*)::integer FROM active_cohort AS c
      WHERE public.lifecycle_email_user_within_frequency_cap(c.user_id)),
    (SELECT count(*)::integer FROM public.marketing_consent_admin_attestations),
    (SELECT max(a.attested_at) FROM public.marketing_consent_admin_attestations AS a);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_get_marketing_consent_cohort_summary() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_marketing_consent_cohort_summary() TO authenticated;

-- Preserve the existing marketing unsubscribe flow while recording its revoke
-- in the same database transaction. This does not touch service/transactional mail.
CREATE OR REPLACE FUNCTION public.apply_lifecycle_unsubscribe(
  p_user_id uuid,
  p_email text,
  p_method text DEFAULT 'link'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_occurred_at timestamptz := clock_timestamp();
  v_consent_version text;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT p.marketing_opt_in_version
    INTO v_consent_version
  FROM public.email_preferences AS p
  WHERE p.user_id = p_user_id
  FOR UPDATE;

  INSERT INTO public.email_preferences (
    user_id, marketing_opt_in, marketing_opt_in_at,
    marketing_opt_in_source, marketing_opt_in_version, unsubscribed_at
  )
  VALUES (p_user_id, false, NULL, 'unsubscribe', NULL, v_occurred_at)
  ON CONFLICT (user_id) DO UPDATE
  SET marketing_opt_in = false,
      marketing_opt_in_at = NULL,
      marketing_opt_in_source = 'unsubscribe',
      marketing_opt_in_version = NULL,
      unsubscribed_at = v_occurred_at,
      updated_at = v_occurred_at;

  IF p_email IS NOT NULL AND length(btrim(p_email)) > 0 THEN
    INSERT INTO public.email_suppressions (email, reason, source)
    VALUES (lower(btrim(p_email)), 'unsub', coalesce(p_method, 'link'))
    ON CONFLICT (email) DO UPDATE
    SET reason = EXCLUDED.reason,
        source = EXCLUDED.source
    -- An unsubscribe must not downgrade an existing hard suppression.
    WHERE public.email_suppressions.reason = 'unsub';
  END IF;

  INSERT INTO public.marketing_consent_events
    (user_id, choice, source, consent_version, created_at)
  VALUES (p_user_id, 'revoked', 'email_unsubscribe', v_consent_version, v_occurred_at);

  PERFORM public.log_lifecycle_email_event(
    NULL,
    p_user_id,
    NULL,
    'unsubscribed',
    jsonb_build_object('method', coalesce(p_method, 'link'))
  );

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.apply_lifecycle_unsubscribe(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_lifecycle_unsubscribe(uuid, text, text) TO service_role;
