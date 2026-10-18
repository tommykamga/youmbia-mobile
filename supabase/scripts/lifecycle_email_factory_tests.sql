-- Preuves SQL Lifecycle Email Factory — DB locale isolée.
\set ON_ERROR_STOP on

DO $$
DECLARE
  u_mig uuid := gen_random_uuid();
  u_ok uuid := gen_random_uuid();
  u_owner uuid := gen_random_uuid();
  listing_id uuid := gen_random_uuid();
  n int;
  outbox_id uuid;
  ok_flag boolean;
  v_skip text;
BEGIN
  UPDATE public.app_runtime_flags SET value = 'false' WHERE key = 'lifecycle_email_kill_switch';

  -- Flags factory OFF
  IF public.lifecycle_runtime_flag_true('lifecycle_marketing_campaigns_enabled') THEN
    RAISE EXCEPTION 'FAIL: marketing factory flag must default OFF';
  END IF;
  IF public.lifecycle_runtime_flag_true('lifecycle_campaign_listing_published_service') THEN
    RAISE EXCEPTION 'FAIL: listing_published flag must default OFF';
  END IF;

  -- Migration groupée : opt-in true mais source non vérifiable → pas d’enqueue marketing
  INSERT INTO auth.users (id, email, created_at, email_confirmed_at, last_sign_in_at, raw_user_meta_data)
  VALUES (u_mig, 'mig@example.test', now() - interval '2 days', now() - interval '2 days', now() - interval '2 days', '{}'::jsonb);
  INSERT INTO public.email_preferences (
    user_id, marketing_opt_in, marketing_opt_in_at, marketing_opt_in_source
  ) VALUES (
    u_mig, true, now(), 'migration_initiale_youmbia_2026_10_18'
  )
  ON CONFLICT (user_id) DO UPDATE SET
    marketing_opt_in = true,
    marketing_opt_in_source = 'migration_initiale_youmbia_2026_10_18',
    unsubscribed_at = NULL;
  INSERT INTO public.profiles (id, full_name, is_banned) VALUES (u_mig, 'Mig', false)
  ON CONFLICT (id) DO UPDATE SET is_banned = false;

  -- Consentement vérifiable signup
  INSERT INTO auth.users (id, email, created_at, email_confirmed_at, last_sign_in_at, raw_user_meta_data)
  VALUES (u_ok, 'ok@example.test', now() - interval '2 days', now() - interval '2 days', now() - interval '2 days', '{}'::jsonb);
  INSERT INTO public.email_preferences (
    user_id, marketing_opt_in, marketing_opt_in_at, marketing_opt_in_source
  ) VALUES (u_ok, true, now(), 'signup')
  ON CONFLICT (user_id) DO UPDATE SET
    marketing_opt_in = true,
    marketing_opt_in_source = 'signup',
    unsubscribed_at = NULL;
  INSERT INTO public.profiles (id, full_name, is_banned) VALUES (u_ok, 'Ok', false)
  ON CONFLICT (id) DO UPDATE SET is_banned = false;

  IF public.lifecycle_has_verifiable_marketing_consent(u_mig) THEN
    RAISE EXCEPTION 'FAIL: migration source must not be verifiable';
  END IF;
  IF NOT public.lifecycle_has_verifiable_marketing_consent(u_ok) THEN
    RAISE EXCEPTION 'FAIL: signup source must be verifiable';
  END IF;

  n := public.enqueue_lifecycle_emails();

  IF EXISTS (
    SELECT 1 FROM public.lifecycle_email_outbox
    WHERE user_id = u_mig AND campaign_id = 'first_listing_h24'
  ) THEN
    RAISE EXCEPTION 'FAIL: migration cohort must not receive first_listing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.lifecycle_email_outbox
    WHERE user_id = u_ok AND campaign_id = 'first_listing_h24' AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'FAIL: verifiable consent user should enqueue first_listing';
  END IF;

  -- Avec flags OFF, pas de nouvelles campagnes marketing
  IF EXISTS (
    SELECT 1 FROM public.lifecycle_email_outbox
    WHERE campaign_id IN (
      'reactivation_j15', 'app_download', 'weekly_discovery', 'seller_activation'
    )
  ) THEN
    RAISE EXCEPTION 'FAIL: factory marketing must stay quiet while flags OFF';
  END IF;

  -- listing_published : flag OFF → trigger no-op
  INSERT INTO auth.users (id, email, created_at, email_confirmed_at, raw_user_meta_data)
  VALUES (u_owner, 'owner@example.test', now(), now(), '{}'::jsonb);
  INSERT INTO public.profiles (id, full_name, is_banned) VALUES (u_owner, 'Owner', false);
  INSERT INTO public.listings (id, user_id, title, city, status, last_published_at, created_at, updated_at)
  VALUES (listing_id, u_owner, 'Test pub', 'Douala', 'active', now(), now(), now());

  IF EXISTS (
    SELECT 1 FROM public.lifecycle_email_outbox
    WHERE campaign_id = 'listing_published_service' AND occurrence_key = listing_id::text
  ) THEN
    RAISE EXCEPTION 'FAIL: listing_published must not enqueue while flag OFF';
  END IF;

  -- Activer flag service + republier (UPDATE status draft→active)
  UPDATE public.app_runtime_flags
  SET value = 'true'
  WHERE key = 'lifecycle_campaign_listing_published_service';

  UPDATE public.listings
  SET status = 'draft', last_published_at = NULL
  WHERE id = listing_id;

  UPDATE public.listings
  SET status = 'active', last_published_at = now(), title = 'Test pub 2'
  WHERE id = listing_id;

  IF NOT EXISTS (
    SELECT 1 FROM public.lifecycle_email_outbox
    WHERE user_id = u_owner
      AND campaign_id = 'listing_published_service'
      AND occurrence_key = listing_id::text
      AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'FAIL: listing_published should enqueue on first publish when flag ON';
  END IF;

  -- Idempotence : second UPDATE metadata ne duplique pas
  UPDATE public.listings SET title = 'Test pub 3' WHERE id = listing_id;
  IF (
    SELECT count(*) FROM public.lifecycle_email_outbox
    WHERE campaign_id = 'listing_published_service' AND occurrence_key = listing_id::text
  ) <> 1 THEN
    RAISE EXCEPTION 'FAIL: listing_published duplicated';
  END IF;

  SELECT id INTO outbox_id FROM public.lifecycle_email_outbox
  WHERE campaign_id = 'listing_published_service' AND occurrence_key = listing_id::text;

  SELECT r.ok, r.skip_reason INTO ok_flag, v_skip
  FROM public.revalidate_lifecycle_send_eligibility(outbox_id) AS r;
  IF ok_flag IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL: listing_published revalidate expected ok, got %', v_skip;
  END IF;

  -- Revalidate marketing refuse migration cohort (outbox artificiel)
  INSERT INTO public.lifecycle_email_outbox (
    user_id, campaign_id, occurrence_key, recipient_email, status, scheduled_for, metadata
  ) VALUES (
    u_mig, 'reactivation_j15', 'x', 'mig@example.test', 'pending', now(),
    '{"channel":"marketing"}'::jsonb
  );
  -- flag ON temporaire pour atteindre le check consent
  UPDATE public.app_runtime_flags SET value = 'true'
  WHERE key IN ('lifecycle_marketing_campaigns_enabled', 'lifecycle_campaign_reactivation_j15');

  SELECT id INTO outbox_id FROM public.lifecycle_email_outbox
  WHERE user_id = u_mig AND campaign_id = 'reactivation_j15';
  SELECT r.ok, r.skip_reason INTO ok_flag, v_skip
  FROM public.revalidate_lifecycle_send_eligibility(outbox_id) AS r;
  IF ok_flag OR v_skip IS DISTINCT FROM 'no_verifiable_consent' THEN
    RAISE EXCEPTION 'FAIL: expected no_verifiable_consent, got ok=% reason=%', ok_flag, v_skip;
  END IF;

  -- Reset flags OFF (hygiène)
  UPDATE public.app_runtime_flags SET value = 'false'
  WHERE key IN (
    'lifecycle_marketing_campaigns_enabled',
    'lifecycle_campaign_reactivation_j15',
    'lifecycle_campaign_listing_published_service'
  );

  RAISE NOTICE 'PASS lifecycle_email_factory_tests (enqueue_delta=% )', n;
END
$$;
