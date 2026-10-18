-- Lifecycle Email Factory — 4 campagnes marketing + listing_published_service.
-- Ne modifie AUCUN consentement historique.
-- Flags marketing OFF par défaut. Garde-fou consentement vérifiable (exclut migration groupée).

-- ---------------------------------------------------------------------------
-- Flags (fail-closed pour nouvelles campagnes marketing)
-- ---------------------------------------------------------------------------
INSERT INTO public.app_runtime_flags (key, value) VALUES
  ('lifecycle_marketing_campaigns_enabled', 'false'),
  ('lifecycle_campaign_reactivation_j15', 'false'),
  ('lifecycle_campaign_app_download', 'false'),
  ('lifecycle_campaign_weekly_discovery', 'false'),
  ('lifecycle_campaign_seller_activation', 'false'),
  ('lifecycle_campaign_listing_published_service', 'false'),
  ('lifecycle_factory_cutoff', to_char(pg_catalog.now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Helpers flags / cutoff / consentement vérifiable
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lifecycle_runtime_flag_true(p_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(
    (
      SELECT lower(btrim(f.value)) = 'true'
      FROM public.app_runtime_flags AS f
      WHERE f.key = p_key
      LIMIT 1
    ),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.lifecycle_runtime_flag_true(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lifecycle_runtime_flag_true(text) FROM anon;
REVOKE ALL ON FUNCTION public.lifecycle_runtime_flag_true(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.lifecycle_runtime_flag_true(text) TO service_role;

CREATE OR REPLACE FUNCTION public.lifecycle_factory_cutoff()
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
      WHERE f.key = 'lifecycle_factory_cutoff'
      LIMIT 1
    ),
    public.lifecycle_email_service_cutoff()
  );
$$;

REVOKE ALL ON FUNCTION public.lifecycle_factory_cutoff() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lifecycle_factory_cutoff() FROM anon;
REVOKE ALL ON FUNCTION public.lifecycle_factory_cutoff() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.lifecycle_factory_cutoff() TO service_role;

-- Consentement marketing individuel vérifiable.
-- Exclut migration_initiale_youmbia_2026_10_18 et toute source non listée / NULL.
CREATE OR REPLACE FUNCTION public.lifecycle_has_verifiable_marketing_consent(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.email_preferences AS p
    WHERE p.user_id = p_user_id
      AND p.marketing_opt_in IS TRUE
      AND p.unsubscribed_at IS NULL
      AND p.marketing_opt_in_source IN ('signup', 'settings')
      AND p.marketing_opt_in_source IS DISTINCT FROM 'migration_initiale_youmbia_2026_10_18'
  );
$$;

REVOKE ALL ON FUNCTION public.lifecycle_has_verifiable_marketing_consent(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lifecycle_has_verifiable_marketing_consent(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.lifecycle_has_verifiable_marketing_consent(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.lifecycle_has_verifiable_marketing_consent(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- Étendre contraintes campaign_id
-- ---------------------------------------------------------------------------
ALTER TABLE public.lifecycle_email_outbox
  DROP CONSTRAINT IF EXISTS lifecycle_email_outbox_campaign_chk;
ALTER TABLE public.lifecycle_email_outbox
  ADD CONSTRAINT lifecycle_email_outbox_campaign_chk
  CHECK (campaign_id IN (
    'welcome_h0',
    'first_listing_h24',
    'abandoned_draft_h24',
    'reactivation_j15',
    'app_download',
    'weekly_discovery',
    'seller_activation',
    'listing_published_service'
  ));

ALTER TABLE public.email_attribution_sessions
  DROP CONSTRAINT IF EXISTS email_attribution_sessions_campaign_chk;
ALTER TABLE public.email_attribution_sessions
  ADD CONSTRAINT email_attribution_sessions_campaign_chk
  CHECK (campaign_id IN (
    'welcome_h0',
    'first_listing_h24',
    'abandoned_draft_h24',
    'reactivation_j15',
    'app_download',
    'weekly_discovery',
    'seller_activation',
    'listing_published_service'
  ));

-- ---------------------------------------------------------------------------
-- Channel helper
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lifecycle_email_campaign_channel(p_campaign_id text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE p_campaign_id
    WHEN 'welcome_h0' THEN 'service'
    WHEN 'listing_published_service' THEN 'service'
    WHEN 'first_listing_h24' THEN 'marketing'
    WHEN 'abandoned_draft_h24' THEN 'marketing'
    WHEN 'reactivation_j15' THEN 'marketing'
    WHEN 'app_download' THEN 'marketing'
    WHEN 'weekly_discovery' THEN 'marketing'
    WHEN 'seller_activation' THEN 'marketing'
    ELSE 'marketing'
  END;
$$;

REVOKE ALL ON FUNCTION public.lifecycle_email_campaign_channel(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lifecycle_email_campaign_channel(text) FROM anon;
REVOKE ALL ON FUNCTION public.lifecycle_email_campaign_channel(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.lifecycle_email_campaign_channel(text) TO service_role;

-- ---------------------------------------------------------------------------
-- Revalidate (consentement vérifiable + flags + nouvelles campagnes)
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
  v_email_confirmed_at timestamptz;
  v_last_sign_in timestamptz;
  v_channel text;
  v_published boolean;
  v_draft_ok boolean;
  v_listing_ok boolean;
  v_cutoff timestamptz := public.lifecycle_email_service_cutoff();
  v_factory timestamptz := public.lifecycle_factory_cutoff();
  v_active_count int;
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

  -- Flags campagnes factory
  IF o.campaign_id IN (
       'reactivation_j15', 'app_download', 'weekly_discovery', 'seller_activation'
     )
     AND (
       NOT public.lifecycle_runtime_flag_true('lifecycle_marketing_campaigns_enabled')
       OR NOT public.lifecycle_runtime_flag_true('lifecycle_campaign_' || o.campaign_id)
     ) THEN
    RETURN QUERY SELECT false, 'campaign_flag_off', o.recipient_email, o.user_id, o.campaign_id, o.occurrence_key, o.metadata;
    RETURN;
  END IF;

  IF o.campaign_id = 'listing_published_service'
     AND NOT public.lifecycle_runtime_flag_true('lifecycle_campaign_listing_published_service') THEN
    RETURN QUERY SELECT false, 'campaign_flag_off', o.recipient_email, o.user_id, o.campaign_id, o.occurrence_key, o.metadata;
    RETURN;
  END IF;

  SELECT u.email, u.created_at, u.email_confirmed_at, u.last_sign_in_at
  INTO v_email, v_created_at, v_email_confirmed_at, v_last_sign_in
  FROM auth.users AS u
  WHERE u.id = o.user_id;

  IF v_email IS NULL OR length(btrim(v_email)) = 0 THEN
    RETURN QUERY SELECT false, 'no_email', o.recipient_email, o.user_id, o.campaign_id, o.occurrence_key, o.metadata;
    RETURN;
  END IF;

  SELECT * INTO pref FROM public.email_preferences AS p WHERE p.user_id = o.user_id;

  IF v_channel = 'marketing' THEN
    IF NOT public.lifecycle_has_verifiable_marketing_consent(o.user_id) THEN
      RETURN QUERY SELECT false, 'no_verifiable_consent', o.recipient_email, o.user_id, o.campaign_id, o.occurrence_key, o.metadata;
      RETURN;
    END IF;
    IF public.lifecycle_email_is_suppressed(v_email) THEN
      RETURN QUERY SELECT false, 'suppressed', v_email, o.user_id, o.campaign_id, o.occurrence_key, o.metadata;
      RETURN;
    END IF;
  ELSE
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
    IF v_email_confirmed_at IS NULL THEN
      RETURN QUERY SELECT false, 'email_not_confirmed', v_email, o.user_id, o.campaign_id, o.occurrence_key, o.metadata;
      RETURN;
    END IF;
  END IF;

  IF o.campaign_id = 'first_listing_h24' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.listings AS l
      WHERE l.user_id = o.user_id AND l.last_published_at IS NOT NULL
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

  IF o.campaign_id = 'reactivation_j15' THEN
    IF v_last_sign_in IS NULL OR v_last_sign_in > pg_catalog.now() - interval '15 days' THEN
      RETURN QUERY SELECT false, 'not_inactive_j15', v_email, o.user_id, o.campaign_id, o.occurrence_key, o.metadata;
      RETURN;
    END IF;
  END IF;

  IF o.campaign_id = 'app_download' THEN
    -- Signal fiable de non-enregistrement push mobile uniquement (≠ preuve d’installation absente).
    IF EXISTS (
      SELECT 1 FROM public.user_push_tokens AS t WHERE t.user_id = o.user_id
    ) THEN
      RETURN QUERY SELECT false, 'has_push_token', v_email, o.user_id, o.campaign_id, o.occurrence_key, o.metadata;
      RETURN;
    END IF;
  END IF;

  IF o.campaign_id = 'weekly_discovery' THEN
    SELECT count(*)::int INTO v_active_count
    FROM public.listings AS l
    WHERE l.status = 'active' AND l.last_published_at IS NOT NULL;
    IF v_active_count < 1 THEN
      RETURN QUERY SELECT false, 'no_active_listings', v_email, o.user_id, o.campaign_id, o.occurrence_key, o.metadata;
      RETURN;
    END IF;
  END IF;

  IF o.campaign_id = 'seller_activation' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.listings AS l
      WHERE l.user_id = o.user_id AND l.last_published_at IS NOT NULL
    ) INTO v_published;
    IF v_published THEN
      RETURN QUERY SELECT false, 'already_published', v_email, o.user_id, o.campaign_id, o.occurrence_key, o.metadata;
      RETURN;
    END IF;
  END IF;

  IF o.campaign_id = 'listing_published_service' THEN
    IF v_email_confirmed_at IS NULL THEN
      RETURN QUERY SELECT false, 'email_not_confirmed', v_email, o.user_id, o.campaign_id, o.occurrence_key, o.metadata;
      RETURN;
    END IF;
    SELECT EXISTS (
      SELECT 1 FROM public.listings AS l
      WHERE l.id::text = o.occurrence_key
        AND l.user_id = o.user_id
        AND l.status = 'active'
        AND l.last_published_at IS NOT NULL
        AND l.last_published_at >= v_factory
    ) INTO v_listing_ok;
    IF NOT v_listing_ok THEN
      RETURN QUERY SELECT false, 'listing_not_public', v_email, o.user_id, o.campaign_id, o.occurrence_key, o.metadata;
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
-- Enqueue (P0 + factory ; consentement vérifiable sur tout marketing)
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
  v_factory timestamptz := public.lifecycle_factory_cutoff();
  v_week text := to_char(pg_catalog.now() AT TIME ZONE 'utc', 'IYYY-"W"IW');
  v_mkt boolean := public.lifecycle_runtime_flag_true('lifecycle_marketing_campaigns_enabled');
BEGIN
  IF public.lifecycle_email_kill_switch_enabled() THEN
    RETURN 0;
  END IF;

  -- A) welcome_h0 — SERVICE
  WITH candidates AS (
    SELECT
      u.id AS user_id,
      lower(btrim(u.email)) AS recipient_email
    FROM auth.users AS u
    LEFT JOIN public.profiles AS prof ON prof.id = u.id
    WHERE u.email IS NOT NULL
      AND length(btrim(u.email)) > 0
      AND u.email_confirmed_at IS NOT NULL
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
      c.user_id, 'welcome_h0', '', c.recipient_email, 'pending', pg_catalog.now(),
      jsonb_build_object('locale', 'fr', 'channel', 'service')
    FROM candidates AS c
    ON CONFLICT (user_id, campaign_id, occurrence_key) DO NOTHING
    RETURNING id
  )
  SELECT count(*) INTO n FROM ins;
  inserted := inserted + coalesce(n, 0);

  -- B) first_listing_h24 — MARKETING + consentement vérifiable
  WITH candidates AS (
    SELECT
      u.id AS user_id,
      lower(btrim(u.email)) AS recipient_email
    FROM auth.users AS u
    INNER JOIN public.email_preferences AS pref ON pref.user_id = u.id
    LEFT JOIN public.profiles AS prof ON prof.id = u.id
    WHERE public.lifecycle_has_verifiable_marketing_consent(u.id)
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
      c.user_id, 'first_listing_h24', '', c.recipient_email, 'pending', pg_catalog.now(),
      jsonb_build_object('locale', 'fr', 'channel', 'marketing')
    FROM candidates AS c
    ON CONFLICT (user_id, campaign_id, occurrence_key) DO NOTHING
    RETURNING id
  )
  SELECT count(*) INTO n FROM ins;
  inserted := inserted + coalesce(n, 0);

  -- C) abandoned_draft_h24 — MARKETING + consentement vérifiable
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
      AND public.lifecycle_has_verifiable_marketing_consent(u.id)
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
      c.user_id, 'abandoned_draft_h24', c.occurrence_key, c.recipient_email, 'pending',
      pg_catalog.now(),
      jsonb_build_object(
        'locale', 'fr', 'channel', 'marketing',
        'listing_id', c.listing_id, 'listing_title', c.listing_title
      )
    FROM candidates AS c
    ON CONFLICT (user_id, campaign_id, occurrence_key) DO NOTHING
    RETURNING id
  )
  SELECT count(*) INTO n FROM ins;
  inserted := inserted + coalesce(n, 0);

  -- D–G) Factory marketing (flags OFF → skip)
  IF v_mkt AND public.lifecycle_runtime_flag_true('lifecycle_campaign_reactivation_j15') THEN
    WITH candidates AS (
      SELECT
        u.id AS user_id,
        lower(btrim(u.email)) AS recipient_email,
        to_char(u.last_sign_in_at AT TIME ZONE 'utc', 'YYYY-MM-DD') AS occurrence_key
      FROM auth.users AS u
      LEFT JOIN public.profiles AS prof ON prof.id = u.id
      WHERE public.lifecycle_has_verifiable_marketing_consent(u.id)
        AND u.email IS NOT NULL AND length(btrim(u.email)) > 0
        AND u.email_confirmed_at IS NOT NULL
        AND u.last_sign_in_at IS NOT NULL
        AND u.last_sign_in_at <= pg_catalog.now() - interval '15 days'
        AND u.last_sign_in_at >= v_factory - interval '15 days'
        AND coalesce(prof.is_banned, false) = false
        AND NOT public.lifecycle_email_is_suppressed(u.email)
        AND NOT public.lifecycle_email_user_within_frequency_cap(u.id)
      ORDER BY u.last_sign_in_at ASC
      LIMIT 50
    ),
    ins AS (
      INSERT INTO public.lifecycle_email_outbox (
        user_id, campaign_id, occurrence_key, recipient_email, status, scheduled_for, metadata
      )
      SELECT
        c.user_id, 'reactivation_j15', c.occurrence_key, c.recipient_email, 'pending',
        pg_catalog.now(),
        jsonb_build_object('locale', 'fr', 'channel', 'marketing')
      FROM candidates AS c
      ON CONFLICT (user_id, campaign_id, occurrence_key) DO NOTHING
      RETURNING id
    )
    SELECT count(*) INTO n FROM ins;
    inserted := inserted + coalesce(n, 0);
  END IF;

  IF v_mkt AND public.lifecycle_runtime_flag_true('lifecycle_campaign_app_download') THEN
    WITH candidates AS (
      SELECT
        u.id AS user_id,
        lower(btrim(u.email)) AS recipient_email
      FROM auth.users AS u
      LEFT JOIN public.profiles AS prof ON prof.id = u.id
      WHERE public.lifecycle_has_verifiable_marketing_consent(u.id)
        AND u.email IS NOT NULL AND length(btrim(u.email)) > 0
        AND u.email_confirmed_at IS NOT NULL
        AND u.created_at >= v_factory
        AND coalesce(prof.is_banned, false) = false
        AND NOT public.lifecycle_email_is_suppressed(u.email)
        AND NOT public.lifecycle_email_user_within_frequency_cap(u.id)
        AND NOT EXISTS (
          SELECT 1 FROM public.user_push_tokens AS t WHERE t.user_id = u.id
        )
      ORDER BY u.created_at ASC
      LIMIT 50
    ),
    ins AS (
      INSERT INTO public.lifecycle_email_outbox (
        user_id, campaign_id, occurrence_key, recipient_email, status, scheduled_for, metadata
      )
      SELECT
        c.user_id, 'app_download', '', c.recipient_email, 'pending', pg_catalog.now(),
        jsonb_build_object(
          'locale', 'fr', 'channel', 'marketing',
          'signal', 'no_push_token',
          'note', 'Absence de token push ≠ preuve de non-installation'
        )
      FROM candidates AS c
      ON CONFLICT (user_id, campaign_id, occurrence_key) DO NOTHING
      RETURNING id
    )
    SELECT count(*) INTO n FROM ins;
    inserted := inserted + coalesce(n, 0);
  END IF;

  IF v_mkt AND public.lifecycle_runtime_flag_true('lifecycle_campaign_weekly_discovery') THEN
    WITH featured AS (
      SELECT l.id, l.title, l.city, l.price
      FROM public.listings AS l
      WHERE l.status = 'active' AND l.last_published_at IS NOT NULL
      ORDER BY l.last_published_at DESC NULLS LAST
      LIMIT 3
    ),
    featured_json AS (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', f.id, 'title', f.title, 'city', f.city, 'price', f.price
      )), '[]'::jsonb) AS items
      FROM featured AS f
    ),
    candidates AS (
      SELECT
        u.id AS user_id,
        lower(btrim(u.email)) AS recipient_email
      FROM auth.users AS u
      LEFT JOIN public.profiles AS prof ON prof.id = u.id
      CROSS JOIN featured_json AS fj
      WHERE public.lifecycle_has_verifiable_marketing_consent(u.id)
        AND u.email IS NOT NULL AND length(btrim(u.email)) > 0
        AND u.email_confirmed_at IS NOT NULL
        AND coalesce(prof.is_banned, false) = false
        AND NOT public.lifecycle_email_is_suppressed(u.email)
        AND NOT public.lifecycle_email_user_within_frequency_cap(u.id)
        AND jsonb_array_length(fj.items) > 0
      ORDER BY u.created_at ASC
      LIMIT 50
    ),
    ins AS (
      INSERT INTO public.lifecycle_email_outbox (
        user_id, campaign_id, occurrence_key, recipient_email, status, scheduled_for, metadata
      )
      SELECT
        c.user_id, 'weekly_discovery', v_week, c.recipient_email, 'pending', pg_catalog.now(),
        jsonb_build_object(
          'locale', 'fr', 'channel', 'marketing',
          'listings', (SELECT items FROM featured_json)
        )
      FROM candidates AS c
      ON CONFLICT (user_id, campaign_id, occurrence_key) DO NOTHING
      RETURNING id
    )
    SELECT count(*) INTO n FROM ins;
    inserted := inserted + coalesce(n, 0);
  END IF;

  IF v_mkt AND public.lifecycle_runtime_flag_true('lifecycle_campaign_seller_activation') THEN
    WITH candidates AS (
      SELECT
        u.id AS user_id,
        lower(btrim(u.email)) AS recipient_email
      FROM auth.users AS u
      LEFT JOIN public.profiles AS prof ON prof.id = u.id
      WHERE public.lifecycle_has_verifiable_marketing_consent(u.id)
        AND u.email IS NOT NULL AND length(btrim(u.email)) > 0
        AND u.email_confirmed_at IS NOT NULL
        AND u.created_at >= v_factory
        AND coalesce(prof.is_banned, false) = false
        AND NOT public.lifecycle_email_is_suppressed(u.email)
        AND NOT public.lifecycle_email_user_within_frequency_cap(u.id)
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
        c.user_id, 'seller_activation', '', c.recipient_email, 'pending', pg_catalog.now(),
        jsonb_build_object('locale', 'fr', 'channel', 'marketing')
      FROM candidates AS c
      ON CONFLICT (user_id, campaign_id, occurrence_key) DO NOTHING
      RETURNING id
    )
    SELECT count(*) INTO n FROM ins;
    inserted := inserted + coalesce(n, 0);
  END IF;

  RETURN inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_lifecycle_emails() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enqueue_lifecycle_emails() FROM anon;
REVOKE ALL ON FUNCTION public.enqueue_lifecycle_emails() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_lifecycle_emails() TO service_role;

-- ---------------------------------------------------------------------------
-- listing_published_service — trigger outbox only (pas d’appel Resend)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enqueue_listing_published_service_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_email text;
  v_factory timestamptz := public.lifecycle_factory_cutoff();
  v_is_first_publish boolean := false;
BEGIN
  IF NOT public.lifecycle_runtime_flag_true('lifecycle_campaign_listing_published_service') THEN
    RETURN NEW;
  END IF;
  IF public.lifecycle_email_kill_switch_enabled() THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM 'active' OR NEW.last_published_at IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.last_published_at < v_factory THEN
    RETURN NEW; -- pas de backfill
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_is_first_publish := true;
  ELSIF TG_OP = 'UPDATE' THEN
    v_is_first_publish :=
      (OLD.status IS DISTINCT FROM 'active' OR OLD.last_published_at IS NULL)
      AND NEW.status = 'active'
      AND NEW.last_published_at IS NOT NULL;
  END IF;

  IF NOT v_is_first_publish THEN
    RETURN NEW;
  END IF;

  SELECT lower(btrim(u.email)) INTO v_email
  FROM auth.users AS u
  WHERE u.id = NEW.user_id
    AND u.email_confirmed_at IS NOT NULL;

  IF v_email IS NULL OR length(v_email) = 0 THEN
    RETURN NEW;
  END IF;

  IF public.lifecycle_email_is_hard_suppressed(v_email) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.lifecycle_email_outbox (
    user_id, campaign_id, occurrence_key, recipient_email, status, scheduled_for, metadata
  )
  VALUES (
    NEW.user_id,
    'listing_published_service',
    NEW.id::text,
    v_email,
    'pending',
    pg_catalog.now(),
    jsonb_build_object(
      'locale', 'fr',
      'channel', 'service',
      'listing_id', NEW.id,
      'listing_title', NEW.title,
      'listing_city', NEW.city
    )
  )
  ON CONFLICT (user_id, campaign_id, occurrence_key) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enqueue_listing_published_service ON public.listings;
CREATE TRIGGER trg_enqueue_listing_published_service
  AFTER INSERT OR UPDATE OF status, last_published_at
  ON public.listings
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_listing_published_service_event();

REVOKE ALL ON FUNCTION public.enqueue_listing_published_service_event() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enqueue_listing_published_service_event() FROM anon;
REVOKE ALL ON FUNCTION public.enqueue_listing_published_service_event() FROM authenticated;
