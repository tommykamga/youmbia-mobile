-- MCC V2.1 — préflight d'audience, activation/pause/reprise atomiques.
-- Préparé pour une base isolée; ne pas appliquer à un projet distant sans GO.

DO $$
BEGIN
  IF pg_catalog.to_regclass('public.email_preferences') IS NULL
     OR pg_catalog.to_regclass('public.email_suppressions') IS NULL
     OR pg_catalog.to_regclass('public.profiles') IS NULL
     OR pg_catalog.to_regclass('public.listings') IS NULL
     OR pg_catalog.to_regclass('public.user_push_tokens') IS NULL
     OR pg_catalog.to_regclass('auth.users') IS NULL
     OR pg_catalog.to_regclass('cron.job') IS NULL
     OR pg_catalog.to_regprocedure('public.lifecycle_factory_cutoff()') IS NULL
     OR pg_catalog.to_regprocedure('public.lifecycle_email_is_suppressed(text)') IS NULL
     OR pg_catalog.to_regprocedure('public.lifecycle_email_user_within_frequency_cap(uuid)') IS NULL
     OR pg_catalog.to_regprocedure('public.lifecycle_has_verifiable_marketing_consent(uuid)') IS NULL
     OR pg_catalog.to_regprocedure('public.enqueue_lifecycle_email_dispatch()') IS NULL
     OR pg_catalog.to_regprocedure('public.claim_lifecycle_emails(uuid,integer)') IS NULL THEN
    RAISE EXCEPTION 'marketing_campaign_preflight prerequisites are missing';
  END IF;
END;
$$;

ALTER TABLE public.marketing_campaign_control_audit
  DROP CONSTRAINT IF EXISTS marketing_campaign_control_audit_new_enabled_check;
ALTER TABLE public.marketing_campaign_control_audit
  ADD COLUMN IF NOT EXISTS action text NOT NULL DEFAULT 'pause';
ALTER TABLE public.marketing_campaign_control_audit
  ADD COLUMN IF NOT EXISTS preflight jsonb;
ALTER TABLE public.marketing_campaign_control_audit
  ADD COLUMN IF NOT EXISTS correlation_id uuid;
ALTER TABLE public.marketing_campaign_control_audit
  DROP CONSTRAINT IF EXISTS marketing_campaign_control_audit_action_check;
ALTER TABLE public.marketing_campaign_control_audit
  ADD CONSTRAINT marketing_campaign_control_audit_action_check
  CHECK (action IN ('activate', 'pause', 'resume'));

DROP FUNCTION IF EXISTS public.get_marketing_campaign_control_state();
CREATE FUNCTION public.get_marketing_campaign_control_state()
RETURNS TABLE (
  campaign_id text,
  flag_key text,
  enabled boolean,
  effective boolean,
  pending_count bigint,
  processing_count bigint,
  last_changed_at timestamptz,
  ever_activated boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin_required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH ids(campaign_id) AS (
    VALUES ('weekly_discovery'::text), ('reactivation_j15'), ('seller_activation'),
      ('app_download'), ('first_listing_h24'), ('abandoned_draft_h24')
  )
  SELECT ids.campaign_id,
    public.marketing_campaign_control_flag(ids.campaign_id),
    public.lifecycle_runtime_flag_true(public.marketing_campaign_control_flag(ids.campaign_id)),
    public.lifecycle_marketing_campaign_enabled(ids.campaign_id),
    (SELECT count(*) FROM public.lifecycle_email_outbox o
      WHERE o.campaign_id=ids.campaign_id AND o.status='pending'),
    (SELECT count(*) FROM public.lifecycle_email_outbox o
      WHERE o.campaign_id=ids.campaign_id AND o.status='processing'),
    (SELECT max(a.created_at) FROM public.marketing_campaign_control_audit a
      WHERE a.campaign_id=ids.campaign_id),
    EXISTS (SELECT 1 FROM public.marketing_campaign_control_audit a
      WHERE a.campaign_id=ids.campaign_id AND a.new_enabled IS TRUE)
  FROM ids ORDER BY ids.campaign_id;
END;
$$;
REVOKE ALL ON FUNCTION public.get_marketing_campaign_control_state() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_marketing_campaign_control_state() TO authenticated;

DROP FUNCTION IF EXISTS public.get_marketing_campaign_control_audit(integer);
CREATE FUNCTION public.get_marketing_campaign_control_audit(p_limit integer DEFAULT 50)
RETURNS TABLE (
  request_id uuid, campaign_id text, action text, previous_enabled boolean,
  enabled boolean, actor_id uuid, cancelled_pending integer, changed_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin_required' USING ERRCODE = '42501';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'invalid_limit' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY SELECT a.request_id,a.campaign_id,a.action,a.previous_enabled,
    a.new_enabled,a.actor_id,a.cancelled_pending,a.created_at
  FROM public.marketing_campaign_control_audit a ORDER BY a.created_at DESC LIMIT p_limit;
END;
$$;
REVOKE ALL ON FUNCTION public.get_marketing_campaign_control_audit(integer) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_marketing_campaign_control_audit(integer) TO authenticated;

DROP FUNCTION IF EXISTS public.get_marketing_campaign_preflight(text);
DROP FUNCTION IF EXISTS public.get_marketing_campaign_preflight(text, timestamptz);
CREATE FUNCTION public.get_marketing_campaign_preflight(
  p_campaign_id text,
  p_evaluated_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_flag_key text := public.marketing_campaign_control_flag(p_campaign_id);
  v_flag_enabled boolean;
  v_global_enabled boolean;
  v_kill_switch boolean;
  v_dispatcher_active boolean := false;
  v_enqueue_active boolean := false;
  v_dispatch_function_ready boolean := pg_catalog.to_regprocedure('public.enqueue_lifecycle_email_dispatch()') IS NOT NULL;
  v_claim_function_ready boolean := pg_catalog.to_regprocedure('public.claim_lifecycle_emails(uuid,integer)') IS NOT NULL;
  v_dispatch_secrets_ready boolean := false;
  v_eligible integer := 0;
  v_batch_limit constant integer := 50;
  v_exclusions jsonb := '{}'::jsonb;
  v_blockers text[] := ARRAY[]::text[];
  v_evaluated_at timestamptz := coalesce(p_evaluated_at, pg_catalog.clock_timestamp());
  v_audience_condition boolean;
BEGIN
  IF v_actor IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin_required' USING ERRCODE = '42501';
  END IF;
  IF v_flag_key IS NULL THEN
    RAISE EXCEPTION 'campaign_not_controllable' USING ERRCODE = '22023';
  END IF;

  SELECT coalesce(lower(btrim(f.value)) = 'true', false)
    INTO v_flag_enabled FROM (SELECT 1) s
    LEFT JOIN public.app_runtime_flags f ON f.key = v_flag_key;
  SELECT public.lifecycle_runtime_flag_true('lifecycle_marketing_campaigns_enabled')
    INTO v_global_enabled;
  SELECT public.lifecycle_email_kill_switch_enabled() INTO v_kill_switch;

  SELECT coalesce(bool_or(active) FILTER (
    WHERE command ILIKE '%enqueue_lifecycle_email_dispatch%'
  ), false), coalesce(bool_or(active) FILTER (
    WHERE command ILIKE '%enqueue_lifecycle_emails%'
  ), false)
    INTO v_dispatcher_active, v_enqueue_active
    FROM cron.job
   WHERE command ILIKE '%enqueue_lifecycle_email_dispatch%'
      OR command ILIKE '%enqueue_lifecycle_emails%';

  IF pg_catalog.to_regclass('vault.decrypted_secrets') IS NOT NULL THEN
    EXECUTE $q$
      SELECT count(DISTINCT name) = 2
      FROM vault.decrypted_secrets
      WHERE name IN ('lifecycle_email_functions_url','lifecycle_email_dispatch_secret')
        AND length(btrim(decrypted_secret)) > 0
    $q$ INTO v_dispatch_secrets_ready;
  END IF;

  v_audience_condition := CASE p_campaign_id
    WHEN 'weekly_discovery' THEN EXISTS (
      SELECT 1 FROM public.listings l
      WHERE l.status = 'active' AND l.last_published_at IS NOT NULL
    )
    ELSE true
  END;

  -- Exact audience rules mirror enqueue_lifecycle_emails(). This returns only
  -- aggregate counts; identifiers, email addresses and listing data stay private.
  WITH targets AS (
    SELECT p_campaign_id AS campaign_id, u.id AS user_id, u.email,
      CASE p_campaign_id
        WHEN 'first_listing_h24' THEN ''
        WHEN 'abandoned_draft_h24' THEN l.id::text
        WHEN 'reactivation_j15' THEN pg_catalog.to_char(u.last_sign_in_at AT TIME ZONE 'utc', 'YYYY-MM-DD')
        WHEN 'weekly_discovery' THEN pg_catalog.to_char(v_evaluated_at AT TIME ZONE 'utc', 'IYYY-"W"IW')
        ELSE ''
      END AS occurrence_key,
      pref.unsubscribed_at IS NOT NULL AS unsubscribed,
      pref.optional_draft_reminders_opt_out IS TRUE AS draft_opt_out,
      public.lifecycle_has_verifiable_marketing_consent(u.id) AS valid_consent,
      u.email_confirmed_at IS NOT NULL AS email_confirmed,
      coalesce(prof.is_banned, false) AS banned,
      public.lifecycle_email_is_suppressed(u.email) AS suppressed,
      public.lifecycle_email_user_within_frequency_cap(u.id) AS frequency_capped,
      (u.email IS NULL OR length(btrim(u.email)) = 0) AS missing_email,
      (p_campaign_id IN ('first_listing_h24','abandoned_draft_h24') OR u.email_confirmed_at IS NOT NULL) AS confirmation_ok
    FROM auth.users u
    LEFT JOIN public.email_preferences pref ON pref.user_id = u.id
    LEFT JOIN public.profiles prof ON prof.id = u.id
    LEFT JOIN public.listings l ON p_campaign_id = 'abandoned_draft_h24'
      AND l.user_id = u.id AND l.status = 'draft' AND l.last_published_at IS NULL
      AND l.updated_at <= v_evaluated_at - interval '24 hours'
      AND l.created_at >= public.lifecycle_factory_cutoff()
    WHERE CASE p_campaign_id
      WHEN 'first_listing_h24' THEN u.created_at <= v_evaluated_at - interval '24 hours'
        AND NOT EXISTS (SELECT 1 FROM public.listings pl WHERE pl.user_id=u.id AND pl.last_published_at IS NOT NULL)
      WHEN 'abandoned_draft_h24' THEN l.id IS NOT NULL
      WHEN 'reactivation_j15' THEN u.last_sign_in_at IS NOT NULL
        AND u.last_sign_in_at <= v_evaluated_at - interval '15 days'
        AND u.last_sign_in_at >= public.lifecycle_factory_cutoff() - interval '15 days'
      WHEN 'app_download' THEN u.created_at >= public.lifecycle_factory_cutoff()
        AND NOT EXISTS (SELECT 1 FROM public.user_push_tokens t WHERE t.user_id=u.id)
      WHEN 'weekly_discovery' THEN v_audience_condition
      WHEN 'seller_activation' THEN u.created_at >= public.lifecycle_factory_cutoff()
        AND NOT EXISTS (SELECT 1 FROM public.listings pl WHERE pl.user_id=u.id AND pl.last_published_at IS NOT NULL)
      ELSE false
    END
  ), classified AS (
    SELECT t.*,
      EXISTS (SELECT 1 FROM public.lifecycle_email_outbox o
        WHERE o.user_id=t.user_id AND o.campaign_id=t.campaign_id
          AND o.occurrence_key=t.occurrence_key) AS duplicate_occurrence,
      (t.valid_consent AND NOT t.unsubscribed AND NOT t.draft_opt_out
        AND NOT t.banned AND NOT t.suppressed AND NOT t.frequency_capped
        AND NOT t.missing_email AND t.confirmation_ok
        AND NOT EXISTS (SELECT 1 FROM public.lifecycle_email_outbox o
          WHERE o.user_id=t.user_id AND o.campaign_id=t.campaign_id
            AND o.occurrence_key=t.occurrence_key)) AS eligible
    FROM targets t
  )
  SELECT least(count(*) FILTER (WHERE eligible), v_batch_limit)::integer,
    jsonb_build_object(
      'audience', count(*),
      'eligible', count(*) FILTER (WHERE eligible),
      'invalid_consent', count(*) FILTER (WHERE NOT valid_consent),
      'unsubscribed', count(*) FILTER (WHERE unsubscribed),
      'draft_reminder_opt_out', count(*) FILTER (WHERE draft_opt_out),
      'suppressed', count(*) FILTER (WHERE suppressed),
      'frequency_cap', count(*) FILTER (WHERE frequency_capped),
      'banned', count(*) FILTER (WHERE banned),
      'email_unconfirmed', count(*) FILTER (WHERE NOT confirmation_ok),
      'missing_email', count(*) FILTER (WHERE missing_email),
      'duplicate_occurrence', count(*) FILTER (WHERE duplicate_occurrence)
    )
    INTO v_eligible, v_exclusions FROM classified;

  IF v_kill_switch THEN v_blockers := pg_catalog.array_append(v_blockers, 'kill_switch_enabled'); END IF;
  IF NOT v_global_enabled THEN v_blockers := pg_catalog.array_append(v_blockers, 'marketing_global_disabled'); END IF;
  IF NOT v_dispatcher_active THEN v_blockers := pg_catalog.array_append(v_blockers, 'dispatcher_inactive_or_unknown'); END IF;
  IF NOT v_enqueue_active THEN v_blockers := pg_catalog.array_append(v_blockers, 'enqueue_inactive_or_unknown'); END IF;
  IF NOT v_dispatch_function_ready OR NOT v_claim_function_ready THEN
    v_blockers := pg_catalog.array_append(v_blockers, 'dispatcher_configuration_missing');
  END IF;
  IF NOT v_dispatch_secrets_ready THEN
    v_blockers := pg_catalog.array_append(v_blockers, 'provider_secrets_missing');
  END IF;
  IF NOT v_audience_condition THEN v_blockers := pg_catalog.array_append(v_blockers, 'campaign_content_unavailable'); END IF;

  RETURN pg_catalog.jsonb_build_object(
    'campaign_id', p_campaign_id,
    'current_enabled', coalesce(v_flag_enabled, false),
    'effective', public.lifecycle_marketing_campaign_enabled(p_campaign_id),
    'evaluated_at', v_evaluated_at,
    'expires_at', v_evaluated_at + interval '2 minutes',
    'batch_limit', v_batch_limit,
    'eligible_count', v_eligible,
    'exclusions', v_exclusions,
    'controls', pg_catalog.jsonb_build_object(
      'consent', 'checked', 'unsubscribe', 'checked', 'suppression', 'checked',
      'frequency_cap_days', 7, 'idempotence', 'checked',
      'enqueue_batch_limit', v_batch_limit, 'dispatch_batch_limit', 20,
      'kill_switch_enabled', v_kill_switch, 'marketing_global_enabled', v_global_enabled,
      'enqueue_active', v_enqueue_active, 'dispatcher_active', v_dispatcher_active,
      'dispatch_function_ready', v_dispatch_function_ready,
      'claim_function_ready', v_claim_function_ready,
      'dispatch_secrets_ready', v_dispatch_secrets_ready
    ),
    'blockers', to_jsonb(v_blockers),
    'ready', cardinality(v_blockers) = 0,
    'fingerprint', pg_catalog.md5(pg_catalog.jsonb_build_object(
      'campaign_id', p_campaign_id, 'current_enabled', coalesce(v_flag_enabled, false),
      'eligible_count', v_eligible, 'exclusions', v_exclusions,
      'controls', pg_catalog.jsonb_build_object('kill', v_kill_switch, 'global', v_global_enabled,
        'enqueue', v_enqueue_active, 'dispatcher', v_dispatcher_active,
        'dispatch_function', v_dispatch_function_ready, 'claim_function', v_claim_function_ready,
      'dispatch_secrets', v_dispatch_secrets_ready),
      'evaluated_at', v_evaluated_at
    )::text)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_marketing_campaign_preflight(text,timestamptz) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_marketing_campaign_preflight(text,timestamptz) TO authenticated;

DROP FUNCTION IF EXISTS public.admin_set_marketing_campaign_state(text,uuid,text,boolean,text);
CREATE OR REPLACE FUNCTION public.admin_set_marketing_campaign_state(
  p_campaign_id text,
  p_request_id uuid,
  p_command text,
  p_expected_enabled boolean,
  p_preflight_fingerprint text DEFAULT NULL,
  p_preflight_evaluated_at timestamptz DEFAULT NULL
)
RETURNS TABLE (
  request_id uuid,
  campaign_id text,
  action text,
  previous_enabled boolean,
  enabled boolean,
  cancelled_pending integer,
  changed_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_flag_key text := public.marketing_campaign_control_flag(p_campaign_id);
  v_current boolean;
  v_new_enabled boolean;
  v_cancelled integer := 0;
  v_preflight jsonb;
  v_existing public.marketing_campaign_control_audit%ROWTYPE;
  v_changed_at timestamptz := pg_catalog.clock_timestamp();
  v_was_activated boolean;
BEGIN
  IF v_actor IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin_required' USING ERRCODE = '42501';
  END IF;
  IF p_request_id IS NULL OR p_expected_enabled IS NULL OR p_command IS NULL
    OR p_command NOT IN ('activate','pause','resume')
    OR v_flag_key IS NULL THEN
    RAISE EXCEPTION 'invalid_campaign_command' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('marketing-campaign:' || p_campaign_id, 0)
  );
  SELECT * INTO v_existing FROM public.marketing_campaign_control_audit a
    WHERE a.request_id = p_request_id;
  IF FOUND THEN
    IF v_existing.actor_id <> v_actor OR v_existing.campaign_id <> p_campaign_id
      OR v_existing.action <> p_command THEN
      RAISE EXCEPTION 'request_id_conflict' USING ERRCODE = '23505';
    END IF;
    RETURN QUERY SELECT v_existing.request_id, v_existing.campaign_id, v_existing.action,
      v_existing.previous_enabled, v_existing.new_enabled,
      v_existing.cancelled_pending, v_existing.created_at;
    RETURN;
  END IF;

  -- Row-level serialization complements the per-campaign lock and guarantees
  -- a fresh state read after any concurrent command.
  SELECT coalesce(lower(btrim(f.value)) = 'true', false) INTO v_current
    FROM public.app_runtime_flags f WHERE f.key = v_flag_key FOR UPDATE;
  IF NOT FOUND THEN v_current := false; END IF;
  IF v_current IS DISTINCT FROM p_expected_enabled THEN
    -- PostgREST 14 retries every 40001; this terminal state conflict must not retry.
    RAISE EXCEPTION 'stale_campaign_state' USING ERRCODE = 'P0001';
  END IF;

  IF p_command = 'pause' THEN
    IF NOT v_current THEN RAISE EXCEPTION 'campaign_already_paused' USING ERRCODE = '22023'; END IF;
    v_new_enabled := false;
  ELSE
    IF v_current THEN RAISE EXCEPTION 'campaign_already_enabled' USING ERRCODE = '22023'; END IF;
    SELECT EXISTS (SELECT 1 FROM public.marketing_campaign_control_audit a
      WHERE a.campaign_id = p_campaign_id AND a.new_enabled IS TRUE) INTO v_was_activated;
    IF p_command = 'activate' AND v_was_activated THEN
      RAISE EXCEPTION 'campaign_already_activated_use_resume' USING ERRCODE = '22023';
    ELSIF p_command = 'resume' AND NOT v_was_activated THEN
      RAISE EXCEPTION 'campaign_not_previously_activated' USING ERRCODE = '22023';
    END IF;

    v_preflight := public.get_marketing_campaign_preflight(p_campaign_id,p_preflight_evaluated_at);
    IF p_preflight_fingerprint IS NULL
      OR p_preflight_evaluated_at IS NULL
      OR p_preflight_evaluated_at > pg_catalog.clock_timestamp()
      OR p_preflight_evaluated_at < pg_catalog.clock_timestamp() - interval '2 minutes'
      OR v_preflight->>'fingerprint' IS DISTINCT FROM p_preflight_fingerprint
      OR (v_preflight->>'expires_at')::timestamptz <= pg_catalog.clock_timestamp()
      OR v_preflight->>'ready' IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'marketing_preflight_failed_or_stale' USING ERRCODE = '55000',
        DETAIL = coalesce(v_preflight->'blockers', '[]'::jsonb)::text;
    END IF;
    v_new_enabled := true;
  END IF;

  INSERT INTO public.app_runtime_flags(key,value,updated_at)
    VALUES(v_flag_key, v_new_enabled::text, v_changed_at)
    ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value, updated_at=EXCLUDED.updated_at;

  IF p_command = 'pause' THEN
    WITH cancelled AS (
      UPDATE public.lifecycle_email_outbox o SET status='cancelled',last_error='campaign_paused_by_admin'
      WHERE o.campaign_id=p_campaign_id AND o.status='pending'
      RETURNING o.id,o.user_id,o.campaign_id
    ) INSERT INTO public.lifecycle_email_events(outbox_id,user_id,campaign_id,event_type,payload)
      SELECT cancelled.id,cancelled.user_id,cancelled.campaign_id,'cancelled',pg_catalog.jsonb_build_object(
        'reason','campaign_paused_by_admin','request_id',p_request_id) FROM cancelled;
    GET DIAGNOSTICS v_cancelled = ROW_COUNT;
  END IF;

  INSERT INTO public.marketing_campaign_control_audit(
    request_id,campaign_id,previous_enabled,new_enabled,actor_id,cancelled_pending,
    created_at,action,preflight,correlation_id
  ) VALUES(p_request_id,p_campaign_id,v_current,v_new_enabled,v_actor,v_cancelled,
    v_changed_at,p_command,v_preflight,p_request_id);

  RETURN QUERY SELECT p_request_id,p_campaign_id,p_command,v_current,v_new_enabled,v_cancelled,v_changed_at;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_marketing_campaign_state(text,uuid,text,boolean,text,timestamptz) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_marketing_campaign_state(text,uuid,text,boolean,text,timestamptz) TO authenticated;

-- Keep the legacy pause RPC as a compatibility wrapper for existing callers.
CREATE OR REPLACE FUNCTION public.admin_pause_marketing_campaign(
  p_campaign_id text, p_request_id uuid, p_expected_enabled boolean
)
RETURNS TABLE (
  request_id uuid, campaign_id text, previous_enabled boolean, enabled boolean,
  cancelled_pending integer, changed_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT r.request_id,r.campaign_id,r.previous_enabled,r.enabled,r.cancelled_pending,r.changed_at
  FROM public.admin_set_marketing_campaign_state(
    p_campaign_id,p_request_id,'pause',p_expected_enabled,NULL,NULL
  ) r;
$$;
REVOKE ALL ON FUNCTION public.admin_pause_marketing_campaign(text,uuid,boolean) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.admin_pause_marketing_campaign(text,uuid,boolean) TO authenticated;
