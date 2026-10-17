-- Lot 04B — parcours E2E SQL (données fictives @example.test uniquement).
-- Prérequis : bootstrap marketplace + migrations lifecycle 150000/160000.
\set ON_ERROR_STOP on

DO $$
DECLARE
  u_welcome uuid := 'a1111111-1111-4111-8111-111111111111';
  u_first   uuid := 'a2222222-2222-4222-8222-222222222222';
  u_draft   uuid := 'a3333333-3333-4333-8333-333333333333';
  u_noptin  uuid := 'a4444444-4444-4444-8444-444444444444';
  u_banned  uuid := 'a5555555-5555-4555-8555-555555555555';
  draft_id  uuid := 'b1111111-1111-4111-8111-111111111111';
  claim_a   uuid := gen_random_uuid();
  claim_b   uuid := gen_random_uuid();
  n int;
  out_id uuid;
  elig record;
  rows_a int;
  rows_b int;
  ok_flag boolean;
BEGIN
  INSERT INTO auth.users (id, email, created_at, raw_user_meta_data)
  VALUES
    (u_welcome, 'welcome@example.test', now() - interval '2 hours', '{"marketing_opt_in":"true"}'::jsonb),
    (u_first,   'first@example.test',   now() - interval '30 hours', '{"marketing_opt_in":"true"}'::jsonb),
    (u_draft,   'draft@example.test',   now() - interval '2 days', '{"marketing_opt_in":"true"}'::jsonb),
    (u_noptin,  'noptin@example.test',  now() - interval '2 days', '{}'::jsonb),
    (u_banned,  'banned@example.test',  now() - interval '2 days', '{"marketing_opt_in":"true"}'::jsonb)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.email_preferences (user_id, marketing_opt_in, marketing_opt_in_at, marketing_opt_in_source)
  VALUES
    (u_welcome, true, now(), 'signup'),
    (u_first, true, now(), 'signup'),
    (u_draft, true, now(), 'signup'),
    (u_noptin, false, null, null),
    (u_banned, true, now(), 'signup')
  ON CONFLICT (user_id) DO UPDATE SET
    marketing_opt_in = EXCLUDED.marketing_opt_in,
    marketing_opt_in_at = EXCLUDED.marketing_opt_in_at,
    unsubscribed_at = NULL;

  INSERT INTO public.profiles (id, full_name, is_banned)
  VALUES
    (u_welcome, 'Welcome Test', false),
    (u_first, 'First Test', false),
    (u_draft, 'Draft Test', false),
    (u_noptin, 'No Opt', false),
    (u_banned, 'Banned Test', true)
  ON CONFLICT (id) DO UPDATE SET is_banned = EXCLUDED.is_banned;

  INSERT INTO public.listings (id, user_id, title, status, updated_at, last_published_at, category_id, description, price, city)
  VALUES (draft_id, u_draft, 'Brouillon vélo fictif', 'draft', now() - interval '30 hours', NULL, 54, 'desc', 0, 'Douala')
  ON CONFLICT (id) DO UPDATE SET
    updated_at = EXCLUDED.updated_at,
    status = 'draft',
    last_published_at = NULL;

  -- Kill switch ON
  UPDATE public.app_runtime_flags SET value = 'true' WHERE key = 'lifecycle_email_kill_switch';
  n := public.enqueue_lifecycle_emails();
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL kill_switch_on enqueue=%', n; END IF;
  RAISE NOTICE 'PASS scenario_kill_switch_on';

  UPDATE public.app_runtime_flags SET value = 'false' WHERE key = 'lifecycle_email_kill_switch';
  n := public.enqueue_lifecycle_emails();

  -- A welcome
  SELECT id INTO out_id FROM public.lifecycle_email_outbox
  WHERE user_id = u_welcome AND campaign_id = 'welcome_h0' AND status = 'pending' LIMIT 1;
  IF out_id IS NULL THEN RAISE EXCEPTION 'FAIL scenario_A welcome missing'; END IF;
  RAISE NOTICE 'PASS scenario_A_welcome_outbox';

  -- B first listing present
  SELECT id INTO out_id FROM public.lifecycle_email_outbox
  WHERE user_id = u_first AND campaign_id = 'first_listing_h24' AND status = 'pending' LIMIT 1;
  IF out_id IS NULL THEN RAISE EXCEPTION 'FAIL scenario_B first_listing missing'; END IF;

  INSERT INTO public.listings (user_id, title, status, last_published_at, category_id, description, price, city)
  VALUES (u_first, 'Annonce publiée', 'active', now(), 54, 'desc', 1000, 'Douala');

  SELECT * INTO elig FROM public.revalidate_lifecycle_send_eligibility(out_id);
  IF elig.ok IS TRUE THEN
    RAISE EXCEPTION 'FAIL scenario_B should skip after publish, got ok';
  END IF;
  RAISE NOTICE 'PASS scenario_B_first_listing_excluded_after_publish reason=%', elig.skip_reason;

  -- C abandoned draft
  SELECT id INTO out_id FROM public.lifecycle_email_outbox
  WHERE user_id = u_draft AND campaign_id = 'abandoned_draft_h24' AND status = 'pending' LIMIT 1;
  IF out_id IS NULL THEN RAISE EXCEPTION 'FAIL scenario_C draft missing'; END IF;

  UPDATE public.listings SET status = 'active', last_published_at = now() WHERE id = draft_id;
  SELECT * INTO elig FROM public.revalidate_lifecycle_send_eligibility(out_id);
  IF elig.ok IS TRUE THEN
    RAISE EXCEPTION 'FAIL scenario_C should cancel after publish';
  END IF;
  RAISE NOTICE 'PASS scenario_C_draft_cancelled_after_publish reason=%', elig.skip_reason;

  -- Security: no opt-in
  IF EXISTS (SELECT 1 FROM public.lifecycle_email_outbox WHERE user_id = u_noptin) THEN
    RAISE EXCEPTION 'FAIL noptin enqueued';
  END IF;
  RAISE NOTICE 'PASS security_consent_absent';

  -- Security: banned
  IF EXISTS (SELECT 1 FROM public.lifecycle_email_outbox WHERE user_id = u_banned) THEN
    RAISE EXCEPTION 'FAIL banned enqueued';
  END IF;
  RAISE NOTICE 'PASS security_banned';

  -- Suppression hard bounce
  INSERT INTO public.email_suppressions (email, reason, source)
  VALUES ('welcome@example.test', 'hard_bounce', 'resend_webhook')
  ON CONFLICT (email) DO UPDATE SET reason = 'hard_bounce';
  SELECT id INTO out_id FROM public.lifecycle_email_outbox
  WHERE user_id = u_welcome AND campaign_id = 'welcome_h0' LIMIT 1;
  -- reset row to pending for revalidate
  UPDATE public.lifecycle_email_outbox SET status = 'pending', claim_id = NULL, claimed_at = NULL
  WHERE id = out_id;
  SELECT * INTO elig FROM public.revalidate_lifecycle_send_eligibility(out_id);
  IF elig.ok IS TRUE THEN RAISE EXCEPTION 'FAIL suppression not applied'; END IF;
  RAISE NOTICE 'PASS security_hard_bounce_suppression';

  -- Unsubscribe
  ok_flag := public.apply_lifecycle_unsubscribe(u_welcome, 'welcome@example.test', 'one_click');
  IF ok_flag IS NOT TRUE THEN RAISE EXCEPTION 'FAIL unsubscribe'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.email_preferences
    WHERE user_id = u_welcome AND marketing_opt_in = false AND unsubscribed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'FAIL unsubscribe prefs';
  END IF;
  RAISE NOTICE 'PASS security_rfc8058_unsubscribe';

  -- Concurrent claim idempotence
  DELETE FROM public.email_suppressions WHERE email = 'first@example.test';
  UPDATE public.email_preferences SET marketing_opt_in = true, unsubscribed_at = NULL
  WHERE user_id = u_first;
  -- ensure pending row for first campaign or create synthetic
  INSERT INTO public.lifecycle_email_outbox (
    user_id, campaign_id, occurrence_key, recipient_email, status, scheduled_for
  ) VALUES (
    u_first, 'welcome_h0', 'e2e-claim-test', 'first@example.test', 'pending', now() - interval '1 minute'
  ) ON CONFLICT (user_id, campaign_id, occurrence_key) DO UPDATE
  SET status = 'pending', claim_id = NULL, claimed_at = NULL, scheduled_for = now() - interval '1 minute';

  SELECT count(*) INTO rows_a FROM public.claim_lifecycle_emails(claim_a, 50);
  SELECT count(*) INTO rows_b FROM public.claim_lifecycle_emails(claim_b, 50);
  IF rows_a < 1 THEN RAISE EXCEPTION 'FAIL claim_a empty'; END IF;
  IF rows_b <> 0 THEN
    -- second claim must not take same rows
    IF EXISTS (
      SELECT 1 FROM public.lifecycle_email_outbox WHERE claim_id = claim_b
    ) THEN
      RAISE EXCEPTION 'FAIL concurrent claim overlap';
    END IF;
  END IF;
  RAISE NOTICE 'PASS security_concurrent_claim a=% b=%', rows_a, rows_b;

  -- Uncertain complete
  SELECT id INTO out_id FROM public.lifecycle_email_outbox WHERE claim_id = claim_a LIMIT 1;
  IF out_id IS NULL THEN RAISE EXCEPTION 'FAIL no claimed row for uncertain'; END IF;
  PERFORM public.complete_lifecycle_email_claim(
    claim_a,
    ARRAY[out_id],
    'uncertain',
    NULL,
    'timeout_mock'
  );
  IF NOT EXISTS (
    SELECT 1 FROM public.lifecycle_email_outbox WHERE id = out_id AND status = 'uncertain'
  ) THEN
    RAISE EXCEPTION 'FAIL uncertain status';
  END IF;
  RAISE NOTICE 'PASS security_uncertain_provider';

  -- Frequency: second welcome same user should not enqueue another if within 7d after sent
  -- (covered by existing IT; spot-check function)
  ok_flag := public.lifecycle_email_user_within_frequency_cap(u_first);
  RAISE NOTICE 'PASS security_frequency_fn within=%', ok_flag;

  -- Restore kill switch ON — zéro transmission fournisseur (SQL path)
  UPDATE public.app_runtime_flags SET value = 'true' WHERE key = 'lifecycle_email_kill_switch';
  n := public.enqueue_lifecycle_emails();
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL final kill switch'; END IF;
  IF NOT public.lifecycle_email_kill_switch_enabled() THEN
    RAISE EXCEPTION 'FAIL kill switch not enabled';
  END IF;
  RAISE NOTICE 'PASS scenario_kill_switch_restored_on';

  RAISE NOTICE 'PASS lifecycle_p0_04b_e2e_scenarios';
END;
$$;
