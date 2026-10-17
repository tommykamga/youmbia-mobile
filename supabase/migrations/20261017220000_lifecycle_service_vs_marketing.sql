-- Lifecycle Email — séparation service vs marketing (additif).
-- Décisions (killcritic) :
--   welcome_h0        → service (pas d’opt-in marketing ; cutoff anti-rétroactif)
--   first_listing_h24 → marketing (inchangé)
--   abandoned_draft_h24 → RESTE marketing (base juridique / info préalable service non documentée)
--     + cutoff anti-rétroactif brouillons + préférence d’opposition draft préparée
-- Aucun forçage de consentement historique. Kill switch inchangé (défaut fail-closed).

-- ---------------------------------------------------------------------------
-- Cutoff anti-rétroactif (figé à l’application de cette migration)
-- ---------------------------------------------------------------------------
INSERT INTO public.app_runtime_flags (key, value)
VALUES (
  'lifecycle_service_cutoff',
  to_char(pg_catalog.now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
)
ON CONFLICT (key) DO NOTHING;

COMMENT ON COLUMN public.app_runtime_flags.value IS
  'Valeur texte du flag. lifecycle_service_cutoff = ISO UTC figé au GO de la séparation service.';

CREATE OR REPLACE FUNCTION public.lifecycle_email_service_cutoff()
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(
    (
      SELECT f.value::timestamptz
      FROM public.app_runtime_flags AS f
      WHERE f.key = 'lifecycle_service_cutoff'
      LIMIT 1
    ),
    'infinity'::timestamptz
  );
$$;

REVOKE ALL ON FUNCTION public.lifecycle_email_service_cutoff() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lifecycle_email_service_cutoff() FROM anon;
REVOKE ALL ON FUNCTION public.lifecycle_email_service_cutoff() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.lifecycle_email_service_cutoff() TO service_role;

-- ---------------------------------------------------------------------------
-- Canal campagne
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lifecycle_email_campaign_channel(p_campaign_id text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE p_campaign_id
    WHEN 'welcome_h0' THEN 'service'
    WHEN 'first_listing_h24' THEN 'marketing'
    WHEN 'abandoned_draft_h24' THEN 'marketing'
    ELSE NULL
  END;
$$;

REVOKE ALL ON FUNCTION public.lifecycle_email_campaign_channel(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lifecycle_email_campaign_channel(text) FROM anon;
REVOKE ALL ON FUNCTION public.lifecycle_email_campaign_channel(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.lifecycle_email_campaign_channel(text) TO service_role;

-- ---------------------------------------------------------------------------
-- Audit : autoriser l’événement d’opposition draft
-- ---------------------------------------------------------------------------
ALTER TABLE public.lifecycle_email_events
  DROP CONSTRAINT IF EXISTS lifecycle_email_events_type_chk;

ALTER TABLE public.lifecycle_email_events
  ADD CONSTRAINT lifecycle_email_events_type_chk
  CHECK (event_type IN (
    'enqueued', 'claimed', 'sent', 'failed', 'skipped', 'uncertain',
    'cancelled', 'unsubscribed', 'bounced', 'complained', 'clicked', 'converted',
    'draft_reminders_opt_out'
  ));

-- ---------------------------------------------------------------------------
-- Préférence d’opposition rappels brouillon (préparée ; éligibilité draft reste marketing)
-- ---------------------------------------------------------------------------
ALTER TABLE public.email_preferences
  ADD COLUMN IF NOT EXISTS optional_draft_reminders_opt_out boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.email_preferences.marketing_opt_in IS
  'true uniquement après consentement explicite. Requis pour campagnes marketing lifecycle (pas welcome service).';

COMMENT ON COLUMN public.email_preferences.optional_draft_reminders_opt_out IS
  'Opposition aux rappels facultatifs de brouillon. Indépendant du marketing_opt_in. Défaut false.';

-- ---------------------------------------------------------------------------
-- Suppressions dures (service) vs toutes (marketing)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lifecycle_email_is_hard_suppressed(p_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  -- Bloque service + marketing : bounce / plainte / manuel / soft épuisé.
  -- N’inclut PAS 'unsub' (désinscription marketing ≠ suppression service).
  SELECT EXISTS (
    SELECT 1
    FROM public.email_suppressions AS s
    WHERE lower(btrim(s.email)) = lower(btrim(p_email))
      AND s.reason IN ('hard_bounce', 'complaint', 'manual', 'soft_bounce_exhausted')
  );
$$;

REVOKE ALL ON FUNCTION public.lifecycle_email_is_hard_suppressed(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lifecycle_email_is_hard_suppressed(text) FROM anon;
REVOKE ALL ON FUNCTION public.lifecycle_email_is_hard_suppressed(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.lifecycle_email_is_hard_suppressed(text) TO service_role;

-- Cap fréquence : uniquement les envois marketing (pas welcome service)
CREATE OR REPLACE FUNCTION public.lifecycle_email_user_within_frequency_cap(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.lifecycle_email_outbox AS o
    WHERE o.user_id = p_user_id
      AND o.status = 'sent'
      AND o.sent_at IS NOT NULL
      AND o.sent_at > pg_catalog.now() - interval '7 days'
      AND public.lifecycle_email_campaign_channel(o.campaign_id) = 'marketing'
  );
$$;

REVOKE ALL ON FUNCTION public.lifecycle_email_user_within_frequency_cap(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lifecycle_email_user_within_frequency_cap(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.lifecycle_email_user_within_frequency_cap(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.lifecycle_email_user_within_frequency_cap(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- Opposition rappels brouillon (sans toucher marketing_opt_in / sans suppression unsub)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_lifecycle_draft_reminders_opt_out(
  p_user_id uuid,
  p_method text DEFAULT 'link'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN false;
  END IF;

  INSERT INTO public.email_preferences (
    user_id, marketing_opt_in, optional_draft_reminders_opt_out
  )
  VALUES (p_user_id, false, true)
  ON CONFLICT (user_id) DO UPDATE
  SET
    optional_draft_reminders_opt_out = true,
    updated_at = pg_catalog.now();

  PERFORM public.log_lifecycle_email_event(
    NULL,
    p_user_id,
    'abandoned_draft_h24',
    'draft_reminders_opt_out',
    jsonb_build_object('method', coalesce(p_method, 'link'))
  );

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_lifecycle_draft_reminders_opt_out(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_lifecycle_draft_reminders_opt_out(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.apply_lifecycle_draft_reminders_opt_out(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.apply_lifecycle_draft_reminders_opt_out(uuid, text) TO service_role;

-- ---------------------------------------------------------------------------
-- Revalidation send
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.revalidate_lifecycle_send_eligibility(p_outbox_id uuid)
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
  o public.lifecycle_email_outbox%ROWTYPE;
  pref public.email_preferences%ROWTYPE;
  prof public.profiles%ROWTYPE;
  v_email text;
  v_created_at timestamptz;
  v_channel text;
  v_published boolean;
  v_draft_ok boolean;
  v_cutoff timestamptz := public.lifecycle_email_service_cutoff();
BEGIN
  SELECT * INTO o FROM public.lifecycle_email_outbox AS x WHERE x.id = p_outbox_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'outbox_not_found', NULL::text, NULL::uuid, NULL::text, NULL::text, NULL::jsonb;
    RETURN;
  END IF;

  v_channel := public.lifecycle_email_campaign_channel(o.campaign_id);

  IF public.lifecycle_email_kill_switch_enabled() THEN
    RETURN QUERY SELECT false, 'kill_switch', o.recipient_email, o.user_id, o.campaign_id, o.occurrence_key, o.metadata;
    RETURN;
  END IF;

  SELECT u.email, u.created_at INTO v_email, v_created_at
  FROM auth.users AS u
  WHERE u.id = o.user_id;

  IF v_email IS NULL OR length(btrim(v_email)) = 0 THEN
    RETURN QUERY SELECT false, 'no_email', o.recipient_email, o.user_id, o.campaign_id, o.occurrence_key, o.metadata;
    RETURN;
  END IF;

  SELECT * INTO pref FROM public.email_preferences AS p WHERE p.user_id = o.user_id;

  IF v_channel = 'marketing' THEN
    IF NOT FOUND OR pref.marketing_opt_in IS NOT TRUE OR pref.unsubscribed_at IS NOT NULL THEN
      RETURN QUERY SELECT false, 'no_consent', o.recipient_email, o.user_id, o.campaign_id, o.occurrence_key, o.metadata;
      RETURN;
    END IF;
    IF public.lifecycle_email_is_suppressed(v_email) THEN
      RETURN QUERY SELECT false, 'suppressed', v_email, o.user_id, o.campaign_id, o.occurrence_key, o.metadata;
      RETURN;
    END IF;
  ELSE
    -- service : pas d’opt-in marketing ; suppressions dures uniquement
    IF public.lifecycle_email_is_hard_suppressed(v_email) THEN
      RETURN QUERY SELECT false, 'suppressed', v_email, o.user_id, o.campaign_id, o.occurrence_key, o.metadata;
      RETURN;
    END IF;
  END IF;

  SELECT * INTO prof FROM public.profiles AS p WHERE p.id = o.user_id;
  IF FOUND AND prof.is_banned IS TRUE THEN
    RETURN QUERY SELECT false, 'banned', o.recipient_email, o.user_id, o.campaign_id, o.occurrence_key, o.metadata;
    RETURN;
  END IF;

  IF v_channel = 'marketing'
     AND public.lifecycle_email_user_within_frequency_cap(o.user_id)
     AND o.status IS DISTINCT FROM 'sent' THEN
    IF EXISTS (
      SELECT 1 FROM public.lifecycle_email_outbox AS x
      WHERE x.user_id = o.user_id
        AND x.status = 'sent'
        AND x.id IS DISTINCT FROM o.id
        AND x.sent_at > pg_catalog.now() - interval '7 days'
        AND public.lifecycle_email_campaign_channel(x.campaign_id) = 'marketing'
    ) THEN
      RETURN QUERY SELECT false, 'frequency_cap', v_email, o.user_id, o.campaign_id, o.occurrence_key, o.metadata;
      RETURN;
    END IF;
  END IF;

  IF o.campaign_id = 'welcome_h0' THEN
    IF v_created_at IS NULL OR v_created_at < v_cutoff THEN
      RETURN QUERY SELECT false, 'pre_cutoff_no_retroactive', v_email, o.user_id, o.campaign_id, o.occurrence_key, o.metadata;
      RETURN;
    END IF;
  END IF;

  IF o.campaign_id = 'first_listing_h24' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.listings AS l
      WHERE l.user_id = o.user_id
        AND l.last_published_at IS NOT NULL
    ) INTO v_published;
    IF v_published THEN
      RETURN QUERY SELECT false, 'already_published', v_email, o.user_id, o.campaign_id, o.occurrence_key, o.metadata;
      RETURN;
    END IF;
  END IF;

  IF o.campaign_id = 'abandoned_draft_h24' THEN
    IF pref.optional_draft_reminders_opt_out IS TRUE THEN
      RETURN QUERY SELECT false, 'draft_reminders_opt_out', v_email, o.user_id, o.campaign_id, o.occurrence_key, o.metadata;
      RETURN;
    END IF;
    SELECT EXISTS (
      SELECT 1 FROM public.listings AS l
      WHERE l.id::text = o.occurrence_key
        AND l.user_id = o.user_id
        AND l.status = 'draft'
        AND l.last_published_at IS NULL
        AND l.created_at >= v_cutoff
    ) INTO v_draft_ok;
    IF NOT v_draft_ok THEN
      RETURN QUERY SELECT false, 'draft_not_eligible', v_email, o.user_id, o.campaign_id, o.occurrence_key, o.metadata;
      RETURN;
    END IF;
  END IF;

  RETURN QUERY SELECT true, NULL::text, lower(btrim(v_email)), o.user_id, o.campaign_id, o.occurrence_key, o.metadata;
END;
$$;

REVOKE ALL ON FUNCTION public.revalidate_lifecycle_send_eligibility(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revalidate_lifecycle_send_eligibility(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.revalidate_lifecycle_send_eligibility(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.revalidate_lifecycle_send_eligibility(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- Enqueue
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enqueue_lifecycle_emails()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  inserted integer := 0;
  n integer;
  v_cutoff timestamptz := public.lifecycle_email_service_cutoff();
BEGIN
  IF public.lifecycle_email_kill_switch_enabled() THEN
    RETURN 0;
  END IF;

  -- A) welcome_h0 — SERVICE (pas d’opt-in marketing ; post-cutoff uniquement)
  WITH candidates AS (
    SELECT
      u.id AS user_id,
      lower(btrim(u.email)) AS recipient_email
    FROM auth.users AS u
    LEFT JOIN public.profiles AS prof ON prof.id = u.id
    WHERE u.email IS NOT NULL
      AND length(btrim(u.email)) > 0
      AND u.created_at >= v_cutoff
      AND u.created_at <= pg_catalog.now()
      AND coalesce(prof.is_banned, false) = false
      AND NOT public.lifecycle_email_is_hard_suppressed(u.email)
    ORDER BY u.created_at ASC
    LIMIT 50
  ),
  ins AS (
    INSERT INTO public.lifecycle_email_outbox (
      user_id, campaign_id, occurrence_key, recipient_email, status, scheduled_for, metadata
    )
    SELECT
      c.user_id,
      'welcome_h0',
      '',
      c.recipient_email,
      'pending',
      pg_catalog.now(),
      jsonb_build_object('locale', 'fr', 'channel', 'service')
    FROM candidates AS c
    ON CONFLICT (user_id, campaign_id, occurrence_key) DO NOTHING
    RETURNING id, user_id
  )
  SELECT count(*) INTO n FROM ins;
  inserted := inserted + coalesce(n, 0);

  INSERT INTO public.lifecycle_email_events (outbox_id, user_id, campaign_id, event_type, payload)
  SELECT i.id, i.user_id, 'welcome_h0', 'enqueued', jsonb_build_object('channel', 'service')
  FROM (
    SELECT o.id, o.user_id
    FROM public.lifecycle_email_outbox AS o
    WHERE o.campaign_id = 'welcome_h0'
      AND o.status = 'pending'
      AND o.created_at > pg_catalog.now() - interval '1 minute'
  ) AS i
  WHERE NOT EXISTS (
    SELECT 1 FROM public.lifecycle_email_events AS e
    WHERE e.outbox_id = i.id AND e.event_type = 'enqueued'
  );

  -- B) first_listing_h24 — MARKETING (inchangé)
  WITH candidates AS (
    SELECT
      u.id AS user_id,
      lower(btrim(u.email)) AS recipient_email
    FROM auth.users AS u
    INNER JOIN public.email_preferences AS pref ON pref.user_id = u.id
    LEFT JOIN public.profiles AS prof ON prof.id = u.id
    WHERE pref.marketing_opt_in IS TRUE
      AND pref.unsubscribed_at IS NULL
      AND u.email IS NOT NULL
      AND length(btrim(u.email)) > 0
      AND coalesce(prof.is_banned, false) = false
      AND NOT public.lifecycle_email_is_suppressed(u.email)
      AND NOT public.lifecycle_email_user_within_frequency_cap(u.id)
      AND u.created_at <= pg_catalog.now() - interval '24 hours'
      AND NOT EXISTS (
        SELECT 1 FROM public.listings AS l
        WHERE l.user_id = u.id AND l.last_published_at IS NOT NULL
      )
    ORDER BY u.created_at ASC
    LIMIT 50
  ),
  ins AS (
    INSERT INTO public.lifecycle_email_outbox (
      user_id, campaign_id, occurrence_key, recipient_email, status, scheduled_for, metadata
    )
    SELECT
      c.user_id,
      'first_listing_h24',
      '',
      c.recipient_email,
      'pending',
      pg_catalog.now(),
      jsonb_build_object('locale', 'fr', 'channel', 'marketing')
    FROM candidates AS c
    ON CONFLICT (user_id, campaign_id, occurrence_key) DO NOTHING
    RETURNING id, user_id
  )
  SELECT count(*) INTO n FROM ins;
  inserted := inserted + coalesce(n, 0);

  -- C) abandoned_draft_h24 — MARKETING (+ cutoff + opposition draft)
  WITH candidates AS (
    SELECT
      u.id AS user_id,
      lower(btrim(u.email)) AS recipient_email,
      l.id::text AS occurrence_key,
      l.id AS listing_id,
      l.title AS listing_title
    FROM public.listings AS l
    INNER JOIN auth.users AS u ON u.id = l.user_id
    INNER JOIN public.email_preferences AS pref ON pref.user_id = u.id
    LEFT JOIN public.profiles AS prof ON prof.id = u.id
    WHERE l.status = 'draft'
      AND l.last_published_at IS NULL
      AND l.updated_at <= pg_catalog.now() - interval '24 hours'
      AND l.created_at >= v_cutoff
      AND pref.marketing_opt_in IS TRUE
      AND pref.unsubscribed_at IS NULL
      AND pref.optional_draft_reminders_opt_out IS NOT TRUE
      AND u.email IS NOT NULL
      AND length(btrim(u.email)) > 0
      AND coalesce(prof.is_banned, false) = false
      AND NOT public.lifecycle_email_is_suppressed(u.email)
      AND NOT public.lifecycle_email_user_within_frequency_cap(u.id)
    ORDER BY l.updated_at ASC
    LIMIT 50
  ),
  ins AS (
    INSERT INTO public.lifecycle_email_outbox (
      user_id, campaign_id, occurrence_key, recipient_email, status, scheduled_for, metadata
    )
    SELECT
      c.user_id,
      'abandoned_draft_h24',
      c.occurrence_key,
      c.recipient_email,
      'pending',
      pg_catalog.now(),
      jsonb_build_object(
        'locale', 'fr',
        'channel', 'marketing',
        'listing_id', c.listing_id,
        'listing_title', c.listing_title
      )
    FROM candidates AS c
    ON CONFLICT (user_id, campaign_id, occurrence_key) DO NOTHING
    RETURNING id, user_id
  )
  SELECT count(*) INTO n FROM ins;
  inserted := inserted + coalesce(n, 0);

  RETURN inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_lifecycle_emails() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enqueue_lifecycle_emails() FROM anon;
REVOKE ALL ON FUNCTION public.enqueue_lifecycle_emails() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_lifecycle_emails() TO service_role;

-- ---------------------------------------------------------------------------
-- Neutraliser les pending rétroactifs (ne touche JAMAIS status=sent)
-- ---------------------------------------------------------------------------
UPDATE public.lifecycle_email_outbox AS o
SET
  status = 'skipped',
  updated_at = pg_catalog.now()
FROM auth.users AS u
WHERE o.user_id = u.id
  AND o.campaign_id = 'welcome_h0'
  AND o.status IN ('pending', 'processing')
  AND u.created_at < public.lifecycle_email_service_cutoff();

UPDATE public.lifecycle_email_outbox AS o
SET
  status = 'skipped',
  updated_at = pg_catalog.now()
FROM public.listings AS l
WHERE o.campaign_id = 'abandoned_draft_h24'
  AND o.status IN ('pending', 'processing')
  AND l.id::text = o.occurrence_key
  AND l.created_at < public.lifecycle_email_service_cutoff();
