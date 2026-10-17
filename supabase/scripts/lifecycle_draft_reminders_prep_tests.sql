-- Preuves SQL préparation rappels brouillon — DB locale isolée uniquement.
-- Prérequis : migrations P0 + service/marketing + 20261018010000 déjà appliquées.
\set ON_ERROR_STOP on

DO $$
DECLARE
  u_hist uuid := gen_random_uuid();
  u_a uuid := gen_random_uuid();
  u_b uuid := gen_random_uuid();
  draft_new uuid := gen_random_uuid();
  draft_old uuid := gen_random_uuid();
  n int;
  cutoff timestamptz;
  ack_at timestamptz;
  ack_a timestamptz;
  ack_b timestamptz;
  mkt_before boolean;
  mkt_after boolean;
  raised boolean;
BEGIN
  cutoff := public.lifecycle_email_service_cutoff();
  UPDATE public.app_runtime_flags SET value = 'false' WHERE key = 'lifecycle_email_kill_switch';

  IF public.lifecycle_draft_reminders_as_service_enabled() IS NOT FALSE THEN
    RAISE EXCEPTION 'FAIL: service flag must be OFF';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.app_runtime_flags
    WHERE key = 'lifecycle_draft_reminders_as_service' AND lower(btrim(value)) = 'false'
  ) THEN
    RAISE EXCEPTION 'FAIL: lifecycle_draft_reminders_as_service missing or not false';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'email_preferences'
      AND column_name = 'draft_reminders_notice_acknowledged_at'
  ) THEN
    RAISE EXCEPTION 'FAIL: draft_reminders_notice_acknowledged_at column missing';
  END IF;

  -- Signature stricte : pas de surcharge (uuid)
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'acknowledge_lifecycle_draft_reminders_notice'
      AND pg_get_function_identity_arguments(p.oid) = 'uuid'
  ) THEN
    RAISE EXCEPTION 'FAIL: acknowledge_lifecycle_draft_reminders_notice(uuid) must be dropped';
  END IF;

  -- Compte historique (pré-cutoff) + opt-in marketing + nouveau brouillon post-cutoff
  INSERT INTO auth.users (id, email, created_at, email_confirmed_at, raw_user_meta_data)
  VALUES (u_hist, 'hist-draft@example.test', cutoff - interval '90 days', cutoff - interval '90 days', '{}'::jsonb);
  INSERT INTO public.email_preferences (user_id, marketing_opt_in, marketing_opt_in_at, marketing_opt_in_source)
  VALUES (u_hist, true, now(), 'settings')
  ON CONFLICT (user_id) DO UPDATE
  SET marketing_opt_in = true, unsubscribed_at = NULL, optional_draft_reminders_opt_out = false;
  INSERT INTO public.profiles (id, full_name, is_banned)
  VALUES (u_hist, 'Hist', false)
  ON CONFLICT (id) DO UPDATE SET is_banned = false;

  INSERT INTO public.listings (id, user_id, title, status, created_at, updated_at, last_published_at)
  VALUES
    (draft_new, u_hist, 'New draft hist', 'draft', now(), now() - interval '48 hours', NULL),
    (draft_old, u_hist, 'Old draft hist', 'draft', cutoff - interval '30 days', now() - interval '48 hours', NULL);

  n := public.enqueue_lifecycle_emails();

  IF NOT EXISTS (
    SELECT 1 FROM public.lifecycle_email_outbox
    WHERE user_id = u_hist
      AND campaign_id = 'abandoned_draft_h24'
      AND occurrence_key = draft_new::text
      AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'FAIL: historic account new draft must remain eligible (no u.created_at filter)';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.lifecycle_email_outbox
    WHERE user_id = u_hist
      AND campaign_id = 'abandoned_draft_h24'
      AND occurrence_key = draft_old::text
  ) THEN
    RAISE EXCEPTION 'FAIL: pre-cutoff draft must stay excluded (no mass retro)';
  END IF;

  -- Sécurité : identité absente refusée
  PERFORM set_config('request.jwt.claim.sub', '', true);
  raised := false;
  BEGIN
    PERFORM public.acknowledge_lifecycle_draft_reminders_notice();
  EXCEPTION
    WHEN insufficient_privilege THEN
      raised := true;
    WHEN OTHERS THEN
      IF SQLERRM ILIKE '%unauthenticated%' OR SQLSTATE = '42501' THEN
        raised := true;
      ELSE
        RAISE;
      END IF;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'FAIL: missing identity must be refused';
  END IF;

  -- Utilisateurs A / B pour isolation
  INSERT INTO auth.users (id, email, created_at, email_confirmed_at, raw_user_meta_data)
  VALUES
    (u_a, 'ack-a@example.test', now(), now(), '{}'::jsonb),
    (u_b, 'ack-b@example.test', now(), now(), '{}'::jsonb);
  INSERT INTO public.email_preferences (user_id, marketing_opt_in)
  VALUES (u_a, true), (u_b, true)
  ON CONFLICT (user_id) DO UPDATE
  SET marketing_opt_in = EXCLUDED.marketing_opt_in, unsubscribed_at = NULL;
  INSERT INTO public.profiles (id, full_name, is_banned)
  VALUES (u_a, 'A', false), (u_b, 'B', false)
  ON CONFLICT (id) DO UPDATE SET is_banned = false;

  SELECT marketing_opt_in INTO mkt_before FROM public.email_preferences WHERE user_id = u_a;

  -- Utilisateur légitime A autorisé
  PERFORM set_config('request.jwt.claim.sub', u_a::text, true);
  PERFORM public.acknowledge_lifecycle_draft_reminders_notice();
  SELECT draft_reminders_notice_acknowledged_at, marketing_opt_in
    INTO ack_a, mkt_after
  FROM public.email_preferences WHERE user_id = u_a;
  IF ack_a IS NULL THEN
    RAISE EXCEPTION 'FAIL: legitimate user ack not persisted';
  END IF;
  IF mkt_after IS DISTINCT FROM mkt_before THEN
    RAISE EXCEPTION 'FAIL: ack must not modify marketing_opt_in';
  END IF;

  -- A ne peut pas écrire pour B (pas de p_user_id : JWT A n’affecte que A)
  SELECT draft_reminders_notice_acknowledged_at INTO ack_b
  FROM public.email_preferences WHERE user_id = u_b;
  IF ack_b IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: user A must not acknowledge for user B';
  END IF;

  -- Compte historique : ack sous son JWT + pas d’écrasement marketing
  SELECT marketing_opt_in INTO mkt_before FROM public.email_preferences WHERE user_id = u_hist;
  PERFORM set_config('request.jwt.claim.sub', u_hist::text, true);
  PERFORM public.acknowledge_lifecycle_draft_reminders_notice();
  SELECT draft_reminders_notice_acknowledged_at, marketing_opt_in
    INTO ack_at, mkt_after
  FROM public.email_preferences WHERE user_id = u_hist;
  IF ack_at IS NULL THEN
    RAISE EXCEPTION 'FAIL: ack notice not persisted';
  END IF;
  IF mkt_after IS DISTINCT FROM mkt_before THEN
    RAISE EXCEPTION 'FAIL: hist ack must not modify marketing_opt_in';
  END IF;

  -- Idempotence ack : horodatage conservé
  PERFORM public.acknowledge_lifecycle_draft_reminders_notice();
  IF (
    SELECT draft_reminders_notice_acknowledged_at FROM public.email_preferences WHERE user_id = u_hist
  ) IS DISTINCT FROM ack_at THEN
    RAISE EXCEPTION 'FAIL: ack notice overwritten';
  END IF;

  -- Canal draft toujours marketing tant que flag OFF
  IF public.lifecycle_email_campaign_channel('abandoned_draft_h24') IS DISTINCT FROM 'marketing' THEN
    RAISE EXCEPTION 'FAIL: draft channel must stay marketing while service flag OFF';
  END IF;

  IF public.lifecycle_email_campaign_channel('first_listing_h24') IS DISTINCT FROM 'marketing' THEN
    RAISE EXCEPTION 'FAIL: first_listing channel regress';
  END IF;

  -- Nettoyage JWT harness
  PERFORM set_config('request.jwt.claim.sub', '', true);

  RAISE NOTICE 'PASS lifecycle_draft_reminders_prep_tests (enqueue_delta=% )', n;
END
$$;
