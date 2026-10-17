-- Preuves SQL Lifecycle P0 — DB locale isolée uniquement.
-- Exit via RAISE EXCEPTION si échec (psql ON_ERROR_STOP).

\set ON_ERROR_STOP on

DO $$
DECLARE
  u1 uuid := gen_random_uuid();
  u2 uuid := gen_random_uuid();
  u3 uuid := gen_random_uuid();
  draft_id uuid := gen_random_uuid();
  claim_a uuid := gen_random_uuid();
  claim_b uuid := gen_random_uuid();
  n int;
  row_count int;
  st text;
  ok_flag boolean;
  skip_reason text;
BEGIN
  -- Seed users
  INSERT INTO auth.users (id, email, created_at, raw_user_meta_data)
  VALUES
    (u1, 'optin@example.test', now() - interval '2 days', '{"marketing_opt_in":"true"}'::jsonb),
    (u2, 'noptin@example.test', now() - interval '2 days', '{}'::jsonb),
    (u3, 'banned@example.test', now() - interval '2 days', '{"marketing_opt_in":"true"}'::jsonb);

  -- Trigger prefs should have run; force known state
  INSERT INTO public.email_preferences (user_id, marketing_opt_in, marketing_opt_in_at, marketing_opt_in_source)
  VALUES
    (u1, true, now(), 'signup'),
    (u2, false, null, null),
    (u3, true, now(), 'signup')
  ON CONFLICT (user_id) DO UPDATE
  SET marketing_opt_in = EXCLUDED.marketing_opt_in,
      marketing_opt_in_at = EXCLUDED.marketing_opt_in_at,
      marketing_opt_in_source = EXCLUDED.marketing_opt_in_source,
      unsubscribed_at = NULL;

  INSERT INTO public.profiles (id, full_name, is_banned)
  VALUES (u1, 'Opt In', false), (u2, 'No Opt', false), (u3, 'Banned', true)
  ON CONFLICT (id) DO UPDATE SET is_banned = EXCLUDED.is_banned;

  INSERT INTO public.listings (id, user_id, title, status, updated_at, last_published_at)
  VALUES (draft_id, u1, 'Vélo test', 'draft', now() - interval '48 hours', NULL);

  -- Kill switch ON by default → enqueue 0
  IF NOT public.lifecycle_email_kill_switch_enabled() THEN
    RAISE EXCEPTION 'FAIL: kill switch should default true';
  END IF;
  n := public.enqueue_lifecycle_emails();
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL: enqueue with kill switch ON returned %', n;
  END IF;

  -- Disable kill switch for tests
  UPDATE public.app_runtime_flags SET value = 'false' WHERE key = 'lifecycle_email_kill_switch';

  -- Consent false → no rows for u2
  n := public.enqueue_lifecycle_emails();
  IF EXISTS (
    SELECT 1 FROM public.lifecycle_email_outbox WHERE user_id = u2
  ) THEN
    RAISE EXCEPTION 'FAIL: opted-out user enqueued';
  END IF;

  -- Banned excluded
  IF EXISTS (
    SELECT 1 FROM public.lifecycle_email_outbox WHERE user_id = u3
  ) THEN
    RAISE EXCEPTION 'FAIL: banned user enqueued';
  END IF;

  -- Opt-in user should have welcome + first_listing and/or draft
  IF NOT EXISTS (
    SELECT 1 FROM public.lifecycle_email_outbox
    WHERE user_id = u1 AND campaign_id = 'welcome_h0' AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'FAIL: welcome_h0 missing for opt-in user';
  END IF;

  -- Idempotence : second enqueue n’ajoute pas de doublon
  SELECT count(*) INTO row_count FROM public.lifecycle_email_outbox WHERE user_id = u1;
  n := public.enqueue_lifecycle_emails();
  IF (SELECT count(*) FROM public.lifecycle_email_outbox WHERE user_id = u1) <> row_count THEN
    RAISE EXCEPTION 'FAIL: enqueue not idempotent';
  END IF;

  -- Claim concurrence : un seul claim gagne
  PERFORM * FROM public.claim_lifecycle_emails(claim_a, 50);
  SELECT count(*) INTO n FROM public.lifecycle_email_outbox
  WHERE claim_id = claim_a AND status = 'processing';
  IF n < 1 THEN
    RAISE EXCEPTION 'FAIL: claim_a got no rows';
  END IF;
  SELECT count(*) INTO row_count FROM public.claim_lifecycle_emails(claim_b, 50);
  IF row_count <> 0 THEN
    RAISE EXCEPTION 'FAIL: concurrent claim_b should get 0, got %', row_count;
  END IF;

  -- Complete sent one row
  SELECT id INTO draft_id FROM public.lifecycle_email_outbox
  WHERE claim_id = claim_a AND campaign_id = 'welcome_h0' LIMIT 1;
  IF draft_id IS NULL THEN
    SELECT id INTO draft_id FROM public.lifecycle_email_outbox
    WHERE claim_id = claim_a LIMIT 1;
  END IF;

  n := public.complete_lifecycle_email_claim(
    claim_a, ARRAY[draft_id], 'sent', 'mock_msg_1', NULL
  );
  IF n <> 1 THEN
    RAISE EXCEPTION 'FAIL: complete sent expected 1 got %', n;
  END IF;

  -- Frequency cap : cannot enqueue another campaign while recent sent
  -- release remaining processing
  PERFORM public.complete_lifecycle_email_claim(
    claim_a,
    ARRAY(SELECT id FROM public.lifecycle_email_outbox WHERE claim_id = claim_a),
    'released',
    NULL,
    'test_release'
  );

  DELETE FROM public.lifecycle_email_outbox
  WHERE user_id = u1 AND status = 'pending';

  n := public.enqueue_lifecycle_emails();
  IF EXISTS (
    SELECT 1 FROM public.lifecycle_email_outbox
    WHERE user_id = u1 AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'FAIL: frequency cap 7d should block new pending after sent';
  END IF;

  -- Suppression blocks revalidate
  INSERT INTO public.email_suppressions (email, reason, source)
  VALUES ('optin@example.test', 'hard_bounce', 'test')
  ON CONFLICT (email) DO NOTHING;

  INSERT INTO public.lifecycle_email_outbox (
    user_id, campaign_id, occurrence_key, recipient_email, status, scheduled_for
  ) VALUES (
    u1, 'abandoned_draft_h24', gen_random_uuid()::text, 'optin@example.test', 'pending', now()
  );

  claim_a := gen_random_uuid();
  PERFORM * FROM public.claim_lifecycle_emails(claim_a, 10);
  SELECT o.id INTO draft_id FROM public.lifecycle_email_outbox o
  WHERE o.claim_id = claim_a LIMIT 1;

  SELECT r.ok, r.skip_reason INTO ok_flag, skip_reason
  FROM public.revalidate_lifecycle_send_eligibility(draft_id) AS r;
  IF ok_flag IS DISTINCT FROM false OR skip_reason IS DISTINCT FROM 'suppressed' THEN
    RAISE EXCEPTION 'FAIL: expected suppressed, got ok=% reason=%', ok_flag, skip_reason;
  END IF;

  -- Unsubscribe
  IF NOT public.apply_lifecycle_unsubscribe(u1, 'optin@example.test', 'test') THEN
    RAISE EXCEPTION 'FAIL: unsubscribe returned false';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.email_preferences
    WHERE user_id = u1 AND marketing_opt_in = true
  ) THEN
    RAISE EXCEPTION 'FAIL: unsubscribe did not clear opt-in';
  END IF;

  -- Stale reclaim with provider_message_id → uncertain (Lot 02)
  INSERT INTO public.lifecycle_email_outbox (
    user_id, campaign_id, occurrence_key, recipient_email, status,
    claim_id, claimed_at, provider_message_id, attempts, scheduled_for
  ) VALUES (
    u2, 'welcome_h0', 'stale-test', 'noptin@example.test', 'processing',
    gen_random_uuid(), now() - interval '20 minutes', 're_already', 1, now()
  );
  claim_b := gen_random_uuid();
  PERFORM * FROM public.claim_lifecycle_emails(claim_b, 50);
  SELECT status INTO st FROM public.lifecycle_email_outbox
  WHERE occurrence_key = 'stale-test';
  IF st IS DISTINCT FROM 'uncertain' THEN
    RAISE EXCEPTION 'FAIL: expected uncertain after stale provider reclaim, got %', st;
  END IF;

  -- Signup metadata opt-in persistence (Lot 02 trigger)
  INSERT INTO auth.users (id, email, created_at, raw_user_meta_data)
  VALUES (
    gen_random_uuid(),
    'meta-optin@example.test',
    now(),
    '{"marketing_opt_in":"true"}'::jsonb
  );
  IF NOT EXISTS (
    SELECT 1 FROM public.email_preferences ep
    JOIN auth.users u ON u.id = ep.user_id
    WHERE u.email = 'meta-optin@example.test'
      AND ep.marketing_opt_in = true
      AND ep.marketing_opt_in_source = 'signup'
  ) THEN
    RAISE EXCEPTION 'FAIL: metadata marketing_opt_in=true not persisted by trigger';
  END IF;

  INSERT INTO auth.users (id, email, created_at, raw_user_meta_data)
  VALUES (
    gen_random_uuid(),
    'meta-default@example.test',
    now(),
    '{}'::jsonb
  );
  IF NOT EXISTS (
    SELECT 1 FROM public.email_preferences ep
    JOIN auth.users u ON u.id = ep.user_id
    WHERE u.email = 'meta-default@example.test'
      AND ep.marketing_opt_in = false
  ) THEN
    RAISE EXCEPTION 'FAIL: default opt-in should be false';
  END IF;

  -- SECURITY DEFINER + search_path='' sur RPCs critiques
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'claim_lifecycle_emails'
      AND p.prosecdef
      AND (
        pg_get_functiondef(p.oid) LIKE '%SET search_path TO ''''%'
        OR pg_get_functiondef(p.oid) LIKE '%SET search_path = ''''%'
      )
  ) THEN
    RAISE EXCEPTION 'FAIL: claim_lifecycle_emails missing SECURITY DEFINER search_path';
  END IF;

  RAISE NOTICE 'PASS lifecycle_p0_integration_tests';
END $$;

-- RLS / grants : authenticated ne doit PAS avoir SELECT sur outbox
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE grantee = 'authenticated'
      AND table_schema = 'public'
      AND table_name = 'lifecycle_email_outbox'
      AND privilege_type = 'SELECT'
  ) THEN
    RAISE EXCEPTION 'FAIL: authenticated has SELECT on outbox';
  END IF;

  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'FAIL: cannot SET ROLE authenticated for RLS check: %', SQLERRM;
  END;

  BEGIN
    PERFORM set_config('request.jwt.claim.sub', (SELECT id::text FROM auth.users LIMIT 1), true);
    PERFORM count(*) FROM public.lifecycle_email_outbox;
    -- Si grant existait, on arriverait ici ; sinon insufficient_privilege
    RAISE EXCEPTION 'FAIL: authenticated SELECT outbox should be denied';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;

  RESET ROLE;
  RAISE NOTICE 'PASS rls_outbox_denied';
END $$;

-- Dry-run defer : pending + schedule lointain (anti-boucle)
DO $$
DECLARE
  uid uuid;
  oid uuid;
  cid uuid := gen_random_uuid();
  n int;
  st text;
  sched timestamptz;
BEGIN
  UPDATE public.app_runtime_flags SET value = 'false' WHERE key = 'lifecycle_email_kill_switch';
  SELECT id INTO uid FROM auth.users WHERE email = 'meta-optin@example.test';
  INSERT INTO public.lifecycle_email_outbox (
    user_id, campaign_id, occurrence_key, recipient_email, status, scheduled_for
  ) VALUES (
    uid, 'welcome_h0', 'dry-run-defer', 'meta-optin@example.test', 'pending', now()
  )
  ON CONFLICT (user_id, campaign_id, occurrence_key) DO UPDATE
  SET status = 'pending', scheduled_for = now(), claim_id = NULL, claimed_at = NULL
  RETURNING id INTO oid;

  PERFORM * FROM public.claim_lifecycle_emails(cid, 5);
  SELECT id INTO oid FROM public.lifecycle_email_outbox
  WHERE occurrence_key = 'dry-run-defer' AND claim_id = cid;
  n := public.defer_lifecycle_email_after_dry_run(cid, ARRAY[oid], 'mock_dry');
  IF n <> 1 THEN
    RAISE EXCEPTION 'FAIL: defer dry_run expected 1 got %', n;
  END IF;
  SELECT status, scheduled_for INTO st, sched
  FROM public.lifecycle_email_outbox WHERE occurrence_key = 'dry-run-defer';
  IF st IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'FAIL: dry_run defer status=%', st;
  END IF;
  IF sched < now() + interval '50 years' THEN
    RAISE EXCEPTION 'FAIL: dry_run defer schedule not far enough: %', sched;
  END IF;
  RAISE NOTICE 'PASS dry_run_deferred';
END $$;
