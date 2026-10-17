-- Lifecycle Email P0 Lot 02 — garde-fous consentement metadata + anti double-send reclaim.
-- Additif. NE PAS APPLIQUER distant sans GO.

-- 1) Opt-in signup via user_metadata.marketing_opt_in = 'true' uniquement (sinon false).
CREATE OR REPLACE FUNCTION public.handle_new_user_email_preferences()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_opt_in boolean := false;
  v_source text := NULL;
BEGIN
  IF lower(coalesce(NEW.raw_user_meta_data ->> 'marketing_opt_in', 'false')) = 'true' THEN
    v_opt_in := true;
    v_source := 'signup';
  END IF;

  INSERT INTO public.email_preferences (
    user_id,
    marketing_opt_in,
    marketing_opt_in_at,
    marketing_opt_in_source
  )
  VALUES (
    NEW.id,
    v_opt_in,
    CASE WHEN v_opt_in THEN pg_catalog.now() ELSE NULL END,
    v_source
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user_email_preferences() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_new_user_email_preferences() FROM anon;
REVOKE ALL ON FUNCTION public.handle_new_user_email_preferences() FROM authenticated;

-- 2) Claim : ne jamais reclaim une row processing qui a déjà un provider_message_id
--    (évite double envoi après timeout post-acceptation Resend).
--    Ces rows passent en uncertain (réconciliation manuelle / webhook).
CREATE OR REPLACE FUNCTION public.claim_lifecycle_emails(
  p_claim_id uuid,
  p_limit integer DEFAULT 20
)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  campaign_id text,
  occurrence_key text,
  recipient_email text,
  attempts integer,
  metadata jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_limit integer := greatest(1, least(coalesce(p_limit, 20), 50));
BEGIN
  IF p_claim_id IS NULL THEN
    RETURN;
  END IF;

  IF public.lifecycle_email_kill_switch_enabled() THEN
    RETURN;
  END IF;

  -- Stale + déjà accepté côté ESP → uncertain, pas de nouvel envoi.
  UPDATE public.lifecycle_email_outbox AS o
  SET
    status = 'uncertain',
    last_error = coalesce(o.last_error, 'stale_claim_with_provider_id'),
    claim_id = NULL,
    claimed_at = NULL
  WHERE o.status = 'processing'
    AND o.provider_message_id IS NOT NULL
    AND (
      o.claimed_at IS NULL
      OR o.claimed_at < pg_catalog.now() - interval '10 minutes'
    );

  RETURN QUERY
  WITH claimable AS (
    SELECT o.id
    FROM public.lifecycle_email_outbox AS o
    WHERE (
        o.status = 'pending'
        AND o.scheduled_for <= pg_catalog.now()
      )
      OR (
        o.status = 'processing'
        AND o.provider_message_id IS NULL
        AND (
          o.claimed_at IS NULL
          OR o.claimed_at < pg_catalog.now() - interval '10 minutes'
        )
      )
    ORDER BY o.scheduled_for ASC, o.created_at ASC
    LIMIT v_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.lifecycle_email_outbox AS o
  SET
    status = 'processing',
    claim_id = p_claim_id,
    claimed_at = pg_catalog.now(),
    attempts = o.attempts + 1
  FROM claimable AS c
  WHERE o.id = c.id
  RETURNING
    o.id,
    o.user_id,
    o.campaign_id,
    o.occurrence_key,
    o.recipient_email,
    o.attempts,
    o.metadata;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_lifecycle_emails(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_lifecycle_emails(uuid, integer) FROM anon;
REVOKE ALL ON FUNCTION public.claim_lifecycle_emails(uuid, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_lifecycle_emails(uuid, integer) TO service_role;
