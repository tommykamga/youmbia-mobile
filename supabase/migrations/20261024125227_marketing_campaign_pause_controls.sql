-- Marketing Command Center V2 — pause ciblée et journalisée.
-- Préparé localement uniquement. Ne pas appliquer à distance sans GO de release.
-- Le contrôle ne réactive aucun flag et n'envoie aucun email.

DO $$
BEGIN
  IF pg_catalog.to_regclass('public.app_runtime_flags') IS NULL
     OR pg_catalog.to_regclass('public.lifecycle_email_outbox') IS NULL
     OR pg_catalog.to_regclass('public.lifecycle_email_events') IS NULL
     OR pg_catalog.to_regprocedure('public.lifecycle_runtime_flag_true(text)') IS NULL
     OR pg_catalog.to_regprocedure('public.lifecycle_email_kill_switch_enabled()') IS NULL
     OR pg_catalog.to_regprocedure('public.revalidate_lifecycle_send_eligibility(uuid)') IS NULL
     OR pg_catalog.to_regprocedure('public.is_admin()') IS NULL THEN
    RAISE EXCEPTION 'marketing_pause_controls prerequisites are missing';
  END IF;
END;
$$;

-- Les deux campagnes historiques n'avaient pas de flag individuel. Elles restent
-- désactivées par défaut après migration jusqu'à une activation autorisée.
INSERT INTO public.app_runtime_flags (key, value)
VALUES
  ('lifecycle_campaign_first_listing_h24', 'false'),
  ('lifecycle_campaign_abandoned_draft_h24', 'false')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.marketing_campaign_control_audit (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  request_id uuid NOT NULL UNIQUE,
  campaign_id text NOT NULL CHECK (campaign_id IN (
    'weekly_discovery',
    'reactivation_j15',
    'seller_activation',
    'app_download',
    'first_listing_h24',
    'abandoned_draft_h24'
  )),
  previous_enabled boolean NOT NULL,
  new_enabled boolean NOT NULL CHECK (new_enabled IS FALSE),
  actor_id uuid NOT NULL,
  cancelled_pending integer NOT NULL DEFAULT 0 CHECK (cancelled_pending >= 0),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);

COMMENT ON TABLE public.marketing_campaign_control_audit IS
  'Append-only audit of targeted lifecycle marketing pauses. No recipient data is stored.';

ALTER TABLE public.marketing_campaign_control_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.marketing_campaign_control_audit FROM PUBLIC;
REVOKE ALL ON TABLE public.marketing_campaign_control_audit FROM anon;
REVOKE ALL ON TABLE public.marketing_campaign_control_audit FROM authenticated;
REVOKE ALL ON TABLE public.marketing_campaign_control_audit FROM service_role;

CREATE OR REPLACE FUNCTION public.prevent_marketing_control_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'marketing campaign audit is append-only'
    USING ERRCODE = '42501';
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_marketing_control_audit_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prevent_marketing_control_audit_mutation() FROM anon;
REVOKE ALL ON FUNCTION public.prevent_marketing_control_audit_mutation() FROM authenticated;
REVOKE ALL ON FUNCTION public.prevent_marketing_control_audit_mutation() FROM service_role;

DROP TRIGGER IF EXISTS trg_marketing_campaign_audit_immutable
  ON public.marketing_campaign_control_audit;
CREATE TRIGGER trg_marketing_campaign_audit_immutable
  BEFORE UPDATE OR DELETE ON public.marketing_campaign_control_audit
  FOR EACH ROW EXECUTE FUNCTION public.prevent_marketing_control_audit_mutation();

CREATE OR REPLACE FUNCTION public.marketing_campaign_control_flag(p_campaign_id text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE p_campaign_id
    WHEN 'weekly_discovery' THEN 'lifecycle_campaign_weekly_discovery'
    WHEN 'reactivation_j15' THEN 'lifecycle_campaign_reactivation_j15'
    WHEN 'seller_activation' THEN 'lifecycle_campaign_seller_activation'
    WHEN 'app_download' THEN 'lifecycle_campaign_app_download'
    WHEN 'first_listing_h24' THEN 'lifecycle_campaign_first_listing_h24'
    WHEN 'abandoned_draft_h24' THEN 'lifecycle_campaign_abandoned_draft_h24'
    ELSE NULL
  END;
$$;

REVOKE ALL ON FUNCTION public.marketing_campaign_control_flag(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.marketing_campaign_control_flag(text) FROM anon;
REVOKE ALL ON FUNCTION public.marketing_campaign_control_flag(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.marketing_campaign_control_flag(text) TO service_role;

CREATE OR REPLACE FUNCTION public.lifecycle_marketing_campaign_enabled(p_campaign_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(
    p_campaign_id IN (
      'weekly_discovery', 'reactivation_j15', 'seller_activation', 'app_download',
      'first_listing_h24', 'abandoned_draft_h24'
    )
    AND NOT public.lifecycle_email_kill_switch_enabled()
    AND public.lifecycle_runtime_flag_true('lifecycle_marketing_campaigns_enabled')
    AND public.lifecycle_runtime_flag_true(
      public.marketing_campaign_control_flag(p_campaign_id)
    ),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.lifecycle_marketing_campaign_enabled(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lifecycle_marketing_campaign_enabled(text) FROM anon;
REVOKE ALL ON FUNCTION public.lifecycle_marketing_campaign_enabled(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.lifecycle_marketing_campaign_enabled(text) TO service_role;

-- Synchronise enqueue, claim and pause through a transaction-scoped lock.
CREATE OR REPLACE FUNCTION public.guard_lifecycle_marketing_outbox_control()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.campaign_id NOT IN (
    'weekly_discovery', 'reactivation_j15', 'seller_activation', 'app_download',
    'first_listing_h24', 'abandoned_draft_h24'
  ) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Enqueue takes the shared lock before it touches unique outbox rows.
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('marketing-campaign:' || NEW.campaign_id, 0)
    );
    IF NOT public.lifecycle_marketing_campaign_enabled(NEW.campaign_id) THEN
      RETURN NULL;
    END IF;
  ELSIF NEW.status = 'processing' AND OLD.status IN ('pending', 'processing') THEN
    -- Claim already holds the outbox row lock here. Do not take the campaign
    -- advisory lock in this trigger (pause takes that lock before row locks).
    -- Final send eligibility is checked again by the RPC wrapper below.
    IF NOT public.lifecycle_marketing_campaign_enabled(NEW.campaign_id) THEN
      -- Returning NULL keeps a disabled occurrence out of the enqueue/claim result.
      RETURN NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_lifecycle_marketing_outbox_control() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_lifecycle_marketing_outbox_control() FROM anon;
REVOKE ALL ON FUNCTION public.guard_lifecycle_marketing_outbox_control() FROM authenticated;
REVOKE ALL ON FUNCTION public.guard_lifecycle_marketing_outbox_control() FROM service_role;

DROP TRIGGER IF EXISTS trg_lifecycle_marketing_outbox_control
  ON public.lifecycle_email_outbox;
CREATE TRIGGER trg_lifecycle_marketing_outbox_control
  BEFORE INSERT OR UPDATE OF status ON public.lifecycle_email_outbox
  FOR EACH ROW EXECUTE FUNCTION public.guard_lifecycle_marketing_outbox_control();

-- Keep existing eligibility policy intact and add a fail-closed wrapper at dispatch.
ALTER FUNCTION public.revalidate_lifecycle_send_eligibility(uuid)
  RENAME TO revalidate_lifecycle_send_eligibility_before_marketing_control;
REVOKE ALL ON FUNCTION public.revalidate_lifecycle_send_eligibility_before_marketing_control(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.revalidate_lifecycle_send_eligibility(p_outbox_id uuid)
RETURNS TABLE (
  ok boolean,
  skip_reason text,
  recipient_email text,
  user_id uuid,
  campaign_id text,
  occurrence_key text,
  metadata jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_outbox public.lifecycle_email_outbox%ROWTYPE;
BEGIN
  SELECT * INTO v_outbox
  FROM public.lifecycle_email_outbox AS o
  WHERE o.id = p_outbox_id;

  IF FOUND
     AND v_outbox.campaign_id IN (
       'weekly_discovery', 'reactivation_j15', 'seller_activation', 'app_download',
       'first_listing_h24', 'abandoned_draft_h24'
     )
     AND NOT public.lifecycle_marketing_campaign_enabled(v_outbox.campaign_id) THEN
    RETURN QUERY SELECT false, 'campaign_paused', v_outbox.recipient_email,
      v_outbox.user_id, v_outbox.campaign_id, v_outbox.occurrence_key, v_outbox.metadata;
    RETURN;
  END IF;

  RETURN QUERY
    SELECT *
    FROM public.revalidate_lifecycle_send_eligibility_before_marketing_control(p_outbox_id);
END;
$$;

REVOKE ALL ON FUNCTION public.revalidate_lifecycle_send_eligibility(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revalidate_lifecycle_send_eligibility(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.revalidate_lifecycle_send_eligibility(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.revalidate_lifecycle_send_eligibility(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.get_marketing_campaign_control_state()
RETURNS TABLE (
  campaign_id text,
  flag_key text,
  enabled boolean,
  effective boolean,
  pending_count bigint,
  processing_count bigint,
  last_changed_at timestamptz
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
    VALUES
      ('weekly_discovery'::text), ('reactivation_j15'), ('seller_activation'),
      ('app_download'), ('first_listing_h24'), ('abandoned_draft_h24')
  ), state AS (
    SELECT
      ids.campaign_id,
      public.marketing_campaign_control_flag(ids.campaign_id) AS flag_key,
      public.lifecycle_runtime_flag_true(public.marketing_campaign_control_flag(ids.campaign_id)) AS enabled,
      public.lifecycle_marketing_campaign_enabled(ids.campaign_id) AS effective,
      (SELECT count(*) FROM public.lifecycle_email_outbox o
       WHERE o.campaign_id = ids.campaign_id AND o.status = 'pending') AS pending_count,
      (SELECT count(*) FROM public.lifecycle_email_outbox o
       WHERE o.campaign_id = ids.campaign_id AND o.status = 'processing') AS processing_count,
      (SELECT max(a.created_at) FROM public.marketing_campaign_control_audit a
       WHERE a.campaign_id = ids.campaign_id) AS last_changed_at
    FROM ids
  )
  SELECT state.campaign_id, state.flag_key, state.enabled, state.effective,
    state.pending_count, state.processing_count, state.last_changed_at
  FROM state
  ORDER BY state.campaign_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_marketing_campaign_control_state() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_marketing_campaign_control_state() FROM anon;
REVOKE ALL ON FUNCTION public.get_marketing_campaign_control_state() FROM service_role;
GRANT EXECUTE ON FUNCTION public.get_marketing_campaign_control_state() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_pause_marketing_campaign(
  p_campaign_id text,
  p_request_id uuid,
  p_expected_enabled boolean
)
RETURNS TABLE (
  request_id uuid,
  campaign_id text,
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
  v_flag_key text;
  v_current boolean;
  v_cancelled integer := 0;
  v_existing public.marketing_campaign_control_audit%ROWTYPE;
  v_changed_at timestamptz;
BEGIN
  IF v_actor IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin_required' USING ERRCODE = '42501';
  END IF;
  IF p_request_id IS NULL OR p_expected_enabled IS NULL THEN
    RAISE EXCEPTION 'invalid_pause_request' USING ERRCODE = '22023';
  END IF;

  v_flag_key := public.marketing_campaign_control_flag(p_campaign_id);
  IF v_flag_key IS NULL THEN
    RAISE EXCEPTION 'campaign_not_controllable' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('marketing-campaign:' || p_campaign_id, 0)
  );

  SELECT * INTO v_existing
  FROM public.marketing_campaign_control_audit AS a
  WHERE a.request_id = p_request_id;
  IF FOUND THEN
    IF v_existing.actor_id <> v_actor OR v_existing.campaign_id <> p_campaign_id THEN
      RAISE EXCEPTION 'request_id_conflict' USING ERRCODE = '23505';
    END IF;
    RETURN QUERY SELECT v_existing.request_id, v_existing.campaign_id,
      v_existing.previous_enabled, v_existing.new_enabled,
      v_existing.cancelled_pending, v_existing.created_at;
    RETURN;
  END IF;

  SELECT coalesce(lower(btrim(f.value)) = 'true', false)
  INTO v_current
  FROM (SELECT 1) AS singleton
  LEFT JOIN public.app_runtime_flags AS f ON f.key = v_flag_key;
  v_current := coalesce(v_current, false);

  IF v_current IS DISTINCT FROM p_expected_enabled THEN
    -- 40001 is retried by PostgREST 14; this is a terminal business conflict.
    RAISE EXCEPTION 'stale_campaign_state' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.app_runtime_flags (key, value, updated_at)
  VALUES (v_flag_key, 'false', pg_catalog.now())
  ON CONFLICT (key) DO UPDATE
    SET value = 'false', updated_at = EXCLUDED.updated_at;

  WITH cancelled AS (
    UPDATE public.lifecycle_email_outbox AS o
    SET status = 'cancelled', last_error = 'campaign_paused_by_admin'
    WHERE o.campaign_id = p_campaign_id AND o.status = 'pending'
    RETURNING o.id, o.user_id, o.campaign_id
  )
  INSERT INTO public.lifecycle_email_events (
    outbox_id, user_id, campaign_id, event_type, payload
  )
  SELECT cancelled.id, cancelled.user_id, cancelled.campaign_id, 'cancelled',
    pg_catalog.jsonb_build_object('reason', 'campaign_paused_by_admin', 'request_id', p_request_id)
  FROM cancelled;
  GET DIAGNOSTICS v_cancelled = ROW_COUNT;

  v_changed_at := pg_catalog.now();
  INSERT INTO public.marketing_campaign_control_audit (
    request_id, campaign_id, previous_enabled, new_enabled, actor_id,
    cancelled_pending, created_at
  )
  VALUES (
    p_request_id, p_campaign_id, v_current, false, v_actor,
    v_cancelled, v_changed_at
  );

  RETURN QUERY SELECT p_request_id, p_campaign_id, v_current, false,
    v_cancelled, v_changed_at;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_pause_marketing_campaign(text, uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_pause_marketing_campaign(text, uuid, boolean) FROM anon;
REVOKE ALL ON FUNCTION public.admin_pause_marketing_campaign(text, uuid, boolean) FROM service_role;
GRANT EXECUTE ON FUNCTION public.admin_pause_marketing_campaign(text, uuid, boolean) TO authenticated;
