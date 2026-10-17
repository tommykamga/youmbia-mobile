-- Preuves SQL préparation rappels brouillon — DB locale isolée uniquement.
-- Prérequis : migrations P0 + service/marketing + 20261018010000 déjà appliquées.
\set ON_ERROR_STOP on

DO $$
DECLARE
  u_hist uuid := gen_random_uuid();
  draft_new uuid := gen_random_uuid();
  draft_old uuid := gen_random_uuid();
  n int;
  cutoff timestamptz;
  ack_at timestamptz;
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

  -- Ack notice (service_role context in harness)
  PERFORM public.acknowledge_lifecycle_draft_reminders_notice(u_hist);
  SELECT draft_reminders_notice_acknowledged_at INTO ack_at
  FROM public.email_preferences WHERE user_id = u_hist;
  IF ack_at IS NULL THEN
    RAISE EXCEPTION 'FAIL: ack notice not persisted';
  END IF;

  -- Idempotence ack : horodatage conservé
  PERFORM public.acknowledge_lifecycle_draft_reminders_notice(u_hist);
  IF (
    SELECT draft_reminders_notice_acknowledged_at FROM public.email_preferences WHERE user_id = u_hist
  ) IS DISTINCT FROM ack_at THEN
    RAISE EXCEPTION 'FAIL: ack notice overwritten';
  END IF;

  -- Canal draft toujours marketing tant que flag OFF
  IF public.lifecycle_email_campaign_channel('abandoned_draft_h24') IS DISTINCT FROM 'marketing' THEN
    RAISE EXCEPTION 'FAIL: draft channel must stay marketing while service flag OFF';
  END IF;

  -- first_listing inchangé : sans opt-in, pas d’enqueue (smoke via helper déjà couvert ailleurs)
  IF public.lifecycle_email_campaign_channel('first_listing_h24') IS DISTINCT FROM 'marketing' THEN
    RAISE EXCEPTION 'FAIL: first_listing channel regress';
  END IF;

  RAISE NOTICE 'PASS lifecycle_draft_reminders_prep_tests (enqueue_delta=% )', n;
END
$$;
