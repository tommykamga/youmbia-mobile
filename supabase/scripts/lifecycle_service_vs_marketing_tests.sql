-- Preuves SQL service vs marketing — DB locale isolée uniquement.
-- Prérequis : migrations P0 + 20261017220000 déjà appliquées.
\set ON_ERROR_STOP on

DO $$
DECLARE
  u_new uuid := gen_random_uuid();
  u_old uuid := gen_random_uuid();
  u_unconfirmed uuid := gen_random_uuid();
  u_optin uuid := gen_random_uuid();
  draft_new uuid := gen_random_uuid();
  draft_old uuid := gen_random_uuid();
  n int;
  cutoff timestamptz;
  outbox_id uuid;
  ok_flag boolean;
  v_skip text;
BEGIN
  cutoff := public.lifecycle_email_service_cutoff();
  IF cutoff IS NULL OR cutoff = 'infinity'::timestamptz THEN
    RAISE EXCEPTION 'FAIL: lifecycle_service_cutoff missing';
  END IF;

  -- Kill OFF for tests
  UPDATE public.app_runtime_flags SET value = 'false' WHERE key = 'lifecycle_email_kill_switch';

  -- Nouveau compte confirmé, SANS opt-in marketing → welcome service OK
  -- created_at = now() (≥ cutoff, ≤ now) — éviter cutoff+interval futur.
  INSERT INTO auth.users (id, email, created_at, email_confirmed_at, raw_user_meta_data)
  VALUES (u_new, 'svc-new@example.test', now(), now(), '{}'::jsonb);
  INSERT INTO public.email_preferences (user_id, marketing_opt_in)
  VALUES (u_new, false)
  ON CONFLICT (user_id) DO UPDATE SET marketing_opt_in = false, unsubscribed_at = NULL;
  INSERT INTO public.profiles (id, full_name, is_banned)
  VALUES (u_new, 'New User', false)
  ON CONFLICT (id) DO UPDATE SET is_banned = false;

  -- Ancien compte (pré-cutoff) confirmé sans opt-in → pas de welcome rétroactif
  INSERT INTO auth.users (id, email, created_at, email_confirmed_at, raw_user_meta_data)
  VALUES (u_old, 'svc-old@example.test', cutoff - interval '2 days', cutoff - interval '2 days', '{}'::jsonb);
  INSERT INTO public.email_preferences (user_id, marketing_opt_in)
  VALUES (u_old, false)
  ON CONFLICT (user_id) DO UPDATE SET marketing_opt_in = false;
  INSERT INTO public.profiles (id, full_name, is_banned)
  VALUES (u_old, 'Old User', false)
  ON CONFLICT (id) DO UPDATE SET is_banned = false;

  -- Nouveau compte NON confirmé → pas de welcome
  INSERT INTO auth.users (id, email, created_at, email_confirmed_at, raw_user_meta_data)
  VALUES (u_unconfirmed, 'svc-unconf@example.test', now(), NULL, '{}'::jsonb);
  INSERT INTO public.email_preferences (user_id, marketing_opt_in)
  VALUES (u_unconfirmed, false)
  ON CONFLICT (user_id) DO UPDATE SET marketing_opt_in = false;
  INSERT INTO public.profiles (id, full_name, is_banned)
  VALUES (u_unconfirmed, 'Unconf', false)
  ON CONFLICT (id) DO UPDATE SET is_banned = false;

  -- Opt-in marketing (compte ancien) pour first_listing / draft post-cutoff
  INSERT INTO auth.users (id, email, created_at, email_confirmed_at, raw_user_meta_data)
  VALUES (u_optin, 'mkt@example.test', cutoff - interval '2 days', cutoff - interval '2 days', '{}'::jsonb);
  INSERT INTO public.email_preferences (user_id, marketing_opt_in, marketing_opt_in_at, marketing_opt_in_source)
  VALUES (u_optin, true, now(), 'signup')
  ON CONFLICT (user_id) DO UPDATE
  SET marketing_opt_in = true, unsubscribed_at = NULL, optional_draft_reminders_opt_out = false;
  INSERT INTO public.profiles (id, full_name, is_banned)
  VALUES (u_optin, 'Mkt', false)
  ON CONFLICT (id) DO UPDATE SET is_banned = false;

  INSERT INTO public.listings (id, user_id, title, status, created_at, updated_at, last_published_at)
  VALUES
    (draft_new, u_optin, 'Draft new', 'draft', now(), now() - interval '48 hours', NULL),
    (draft_old, u_optin, 'Draft old', 'draft', cutoff - interval '10 days', now() - interval '48 hours', NULL);

  n := public.enqueue_lifecycle_emails();

  IF NOT EXISTS (
    SELECT 1 FROM public.lifecycle_email_outbox
    WHERE user_id = u_new AND campaign_id = 'welcome_h0' AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'FAIL: welcome service missing for confirmed new user without marketing opt-in';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.lifecycle_email_outbox WHERE user_id = u_old AND campaign_id = 'welcome_h0'
  ) THEN
    RAISE EXCEPTION 'FAIL: retroactive welcome for pre-cutoff account';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.lifecycle_email_outbox WHERE user_id = u_unconfirmed AND campaign_id = 'welcome_h0'
  ) THEN
    RAISE EXCEPTION 'FAIL: welcome enqueued for unconfirmed email';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.lifecycle_email_outbox
    WHERE user_id = u_optin AND campaign_id = 'abandoned_draft_h24' AND occurrence_key = draft_old::text
  ) THEN
    RAISE EXCEPTION 'FAIL: pre-cutoff draft enqueued';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.lifecycle_email_outbox
    WHERE user_id = u_optin AND campaign_id = 'abandoned_draft_h24' AND occurrence_key = draft_new::text
  ) THEN
    RAISE EXCEPTION 'FAIL: post-cutoff draft not enqueued for marketing opt-in';
  END IF;

  -- Revalidate welcome OK
  SELECT id INTO outbox_id FROM public.lifecycle_email_outbox
  WHERE user_id = u_new AND campaign_id = 'welcome_h0' LIMIT 1;
  SELECT r.ok, r.skip_reason INTO ok_flag, v_skip
  FROM public.revalidate_lifecycle_send_eligibility(outbox_id) AS r;
  IF ok_flag IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL: welcome revalidate expected ok, got %', v_skip;
  END IF;

  -- Unconfirmed welcome row artificially inserted → skip email_not_confirmed
  INSERT INTO public.lifecycle_email_outbox (
    user_id, campaign_id, occurrence_key, recipient_email, status, scheduled_for, metadata
  ) VALUES (
    u_unconfirmed, 'welcome_h0', '', 'svc-unconf@example.test', 'pending', now(),
    '{"channel":"service"}'::jsonb
  )
  ON CONFLICT DO NOTHING;
  SELECT id INTO outbox_id FROM public.lifecycle_email_outbox
  WHERE user_id = u_unconfirmed AND campaign_id = 'welcome_h0' LIMIT 1;
  SELECT r.ok, r.skip_reason INTO ok_flag, v_skip
  FROM public.revalidate_lifecycle_send_eligibility(outbox_id) AS r;
  IF ok_flag OR v_skip IS DISTINCT FROM 'email_not_confirmed' THEN
    RAISE EXCEPTION 'FAIL: expected email_not_confirmed, got ok=% reason=%', ok_flag, v_skip;
  END IF;

  -- Opposition draft → revalidate skip
  PERFORM public.apply_lifecycle_draft_reminders_opt_out(u_optin, 'test');
  SELECT id INTO outbox_id FROM public.lifecycle_email_outbox
  WHERE user_id = u_optin AND campaign_id = 'abandoned_draft_h24' AND occurrence_key = draft_new::text;
  SELECT r.ok, r.skip_reason INTO ok_flag, v_skip
  FROM public.revalidate_lifecycle_send_eligibility(outbox_id) AS r;
  IF ok_flag OR v_skip IS DISTINCT FROM 'draft_reminders_opt_out' THEN
    RAISE EXCEPTION 'FAIL: expected draft_reminders_opt_out, got ok=% reason=%', ok_flag, v_skip;
  END IF;

  -- first_listing sans opt-in reste bloqué (u_new)
  IF EXISTS (
    SELECT 1 FROM public.lifecycle_email_outbox
    WHERE user_id = u_new AND campaign_id = 'first_listing_h24'
  ) THEN
    RAISE EXCEPTION 'FAIL: first_listing enqueued without marketing opt-in';
  END IF;

  -- Canal helper
  IF public.lifecycle_email_campaign_channel('welcome_h0') IS DISTINCT FROM 'service' THEN
    RAISE EXCEPTION 'FAIL: welcome channel';
  END IF;
  IF public.lifecycle_email_campaign_channel('abandoned_draft_h24') IS DISTINCT FROM 'marketing' THEN
    RAISE EXCEPTION 'FAIL: draft channel';
  END IF;

  -- outbox n’a pas updated_at (smoke schema)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'lifecycle_email_outbox' AND column_name = 'updated_at'
  ) THEN
    RAISE EXCEPTION 'FAIL: unexpected updated_at on lifecycle_email_outbox';
  END IF;

  RAISE NOTICE 'PASS lifecycle_service_vs_marketing_tests (enqueued=% )', n;
END
$$;
