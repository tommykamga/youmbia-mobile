-- V2.1 read-only live aggregates and admin-only audit history.
-- This migration adds no campaign activation or email-send path.
DO $$
BEGIN
  IF pg_catalog.to_regclass('public.lifecycle_email_outbox') IS NULL
     OR pg_catalog.to_regclass('public.lifecycle_email_events') IS NULL
     OR pg_catalog.to_regclass('public.marketing_campaign_control_audit') IS NULL
     OR pg_catalog.to_regprocedure('public.is_admin()') IS NULL THEN
    RAISE EXCEPTION 'marketing_live_dashboard prerequisites are missing';
  END IF;
END;
$$;

-- Read-only operational aggregates for the admin dashboard. No recipient,
-- profile, or outbox identifiers leave the database.
CREATE OR REPLACE FUNCTION public.get_marketing_dashboard_aggregates()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result jsonb;
  v_cron jsonb := '{}'::jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin_required' USING ERRCODE = '42501';
  END IF;

  IF pg_catalog.to_regclass('cron.job') IS NOT NULL THEN
    EXECUTE $q$
      SELECT coalesce(jsonb_object_agg(name, jsonb_build_object(
        'active', active, 'schedule', schedule
      )), '{}'::jsonb)
      FROM (
        SELECT CASE
          WHEN command ILIKE '%enqueue_lifecycle_emails%' THEN 'enqueue'
          WHEN command ILIKE '%enqueue_lifecycle_email_dispatch%' THEN 'dispatch'
        END AS name, active, schedule
        FROM cron.job
        WHERE command ILIKE '%enqueue_lifecycle_emails%'
           OR command ILIKE '%enqueue_lifecycle_email_dispatch%'
      ) jobs
    $q$ INTO v_cron;
  END IF;

  WITH campaign_ids(campaign_id) AS (
    VALUES ('weekly_discovery'::text), ('reactivation_j15'), ('seller_activation'),
      ('app_download'), ('listing_published_service'), ('welcome_h0'),
      ('first_listing_h24'), ('abandoned_draft_h24')
  ), campaign_counts AS (
    SELECT ids.campaign_id,
      count(o.id) FILTER (WHERE o.status = 'pending') AS pending,
      count(o.id) FILTER (WHERE o.status = 'processing') AS processing,
      count(o.id) FILTER (WHERE o.status = 'sent') AS accepted,
      count(o.id) FILTER (WHERE o.status = 'skipped') AS skipped,
      count(o.id) FILTER (WHERE o.status = 'failed') AS failed,
      count(o.id) FILTER (WHERE o.status = 'uncertain') AS uncertain,
      count(o.id) FILTER (WHERE o.status = 'cancelled') AS cancelled
    FROM campaign_ids ids
    LEFT JOIN public.lifecycle_email_outbox o ON o.campaign_id = ids.campaign_id
    GROUP BY ids.campaign_id
  ), event_counts AS (
    SELECT count(*) FILTER (WHERE event_type = 'enqueued') AS enqueued,
      count(*) FILTER (WHERE event_type = 'bounced') AS bounced,
      count(*) FILTER (WHERE event_type = 'complained') AS complained,
      max(created_at) AS latest_at
    FROM public.lifecycle_email_events
  ), runtime AS (
    SELECT
      public.lifecycle_email_kill_switch_enabled() AS kill_switch,
      public.lifecycle_runtime_flag_true('lifecycle_marketing_campaigns_enabled') AS marketing_global
  )
  SELECT jsonb_build_object(
    'read_at', pg_catalog.clock_timestamp(),
    'source', 'supabase_live_aggregate',
    'timezone', 'UTC',
    'period', jsonb_build_object('kind', 'all_time', 'from', NULL, 'to', pg_catalog.clock_timestamp()),
    'system', jsonb_build_object(
      'kill_switch_enabled', runtime.kill_switch,
      'marketing_global_enabled', runtime.marketing_global,
      'cron', v_cron
    ),
    'totals', jsonb_build_object(
      'prepared', coalesce(sum(pending + processing + accepted + skipped + failed + uncertain + cancelled), 0),
      'pending', coalesce(sum(pending), 0),
      'processing', coalesce(sum(processing), 0),
      'accepted', coalesce(sum(accepted), 0),
      'skipped', coalesce(sum(skipped), 0),
      'failed', coalesce(sum(failed), 0),
      'uncertain', coalesce(sum(uncertain), 0),
      'cancelled', coalesce(sum(cancelled), 0),
      'delivered', NULL
    ),
    'events', (SELECT jsonb_build_object('enqueued', enqueued, 'bounced', bounced,
      'complained', complained, 'latest_at', latest_at, 'delivered', NULL) FROM event_counts),
    'campaigns', coalesce((SELECT jsonb_agg(jsonb_build_object(
      'campaign_id', campaign_id, 'pending', pending, 'processing', processing,
      'accepted', accepted, 'skipped', skipped, 'failed', failed,
      'uncertain', uncertain, 'cancelled', cancelled, 'delivered', NULL
    ) ORDER BY campaign_id) FROM campaign_counts), '[]'::jsonb)
  ) INTO v_result
  FROM campaign_counts CROSS JOIN runtime
  GROUP BY runtime.kill_switch, runtime.marketing_global;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_marketing_dashboard_aggregates() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_marketing_dashboard_aggregates() FROM anon;
REVOKE ALL ON FUNCTION public.get_marketing_dashboard_aggregates() FROM service_role;
GRANT EXECUTE ON FUNCTION public.get_marketing_dashboard_aggregates() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_marketing_campaign_control_audit(p_limit integer DEFAULT 50)
RETURNS TABLE (
  request_id uuid,
  campaign_id text,
  action text,
  previous_enabled boolean,
  enabled boolean,
  actor_id uuid,
  cancelled_pending integer,
  changed_at timestamptz
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
  RETURN QUERY SELECT a.request_id, a.campaign_id, a.action, a.previous_enabled,
    a.new_enabled, a.actor_id, a.cancelled_pending, a.created_at
  FROM public.marketing_campaign_control_audit a
  ORDER BY a.created_at DESC LIMIT p_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.get_marketing_campaign_control_audit(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_marketing_campaign_control_audit(integer) FROM anon;
REVOKE ALL ON FUNCTION public.get_marketing_campaign_control_audit(integer) FROM service_role;
GRANT EXECUTE ON FUNCTION public.get_marketing_campaign_control_audit(integer) TO authenticated;
