-- Lifecycle Email P0 — outbox marketing (additif).
-- NE PAS APPLIQUER en prod / staging distant sans GO explicite.
-- Isolation Auth : ne touche PAS auth.users templates ni Resend Auth web.
--
-- Pattern aligné saved-search : claim atomique, pg_net + pg_cron (local/versionné),
-- Vault secrets hors git, search_path='', SECURITY DEFINER restreint.

-- ---------------------------------------------------------------------------
-- 0) Flags runtime (kill switch)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_runtime_flags (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT app_runtime_flags_key_not_blank_chk CHECK (length(btrim(key)) > 0)
);

COMMENT ON TABLE public.app_runtime_flags IS
  'Flags serveur (ex. lifecycle_email_kill_switch). Lecture/écriture service_role uniquement.';

ALTER TABLE public.app_runtime_flags ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.app_runtime_flags FROM PUBLIC;
REVOKE ALL ON TABLE public.app_runtime_flags FROM anon;
REVOKE ALL ON TABLE public.app_runtime_flags FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.app_runtime_flags TO service_role;

-- Défaut ON : aucun enqueue/claim tant que GO staging n’a pas basculé à false.
INSERT INTO public.app_runtime_flags (key, value)
VALUES ('lifecycle_email_kill_switch', 'true')
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 1) Préférences email (consentement)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.email_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  marketing_opt_in boolean NOT NULL DEFAULT false,
  marketing_opt_in_at timestamptz,
  marketing_opt_in_source text,
  unsubscribed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT email_preferences_opt_in_source_chk
    CHECK (
      marketing_opt_in_source IS NULL
      OR length(btrim(marketing_opt_in_source)) > 0
    )
);

COMMENT ON TABLE public.email_preferences IS
  'Consentement marketing. Défaut opt-in = false. Auth emails ne lisent pas cette table.';

COMMENT ON COLUMN public.email_preferences.marketing_opt_in IS
  'true uniquement après consentement explicite. Requis pour tout enqueue/send lifecycle.';

CREATE OR REPLACE FUNCTION public.email_preferences_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := pg_catalog.now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_email_preferences_set_updated_at ON public.email_preferences;
CREATE TRIGGER trg_email_preferences_set_updated_at
  BEFORE UPDATE ON public.email_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.email_preferences_set_updated_at();

REVOKE ALL ON FUNCTION public.email_preferences_set_updated_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.email_preferences_set_updated_at() FROM anon;
REVOKE ALL ON FUNCTION public.email_preferences_set_updated_at() FROM authenticated;

ALTER TABLE public.email_preferences ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'email_preferences'
      AND policyname = 'email_preferences_select_own'
  ) THEN
    CREATE POLICY email_preferences_select_own
      ON public.email_preferences
      FOR SELECT
      TO authenticated
      USING (user_id = (SELECT auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'email_preferences'
      AND policyname = 'email_preferences_update_own'
  ) THEN
    CREATE POLICY email_preferences_update_own
      ON public.email_preferences
      FOR UPDATE
      TO authenticated
      USING (user_id = (SELECT auth.uid()))
      WITH CHECK (user_id = (SELECT auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'email_preferences'
      AND policyname = 'email_preferences_insert_own'
  ) THEN
    CREATE POLICY email_preferences_insert_own
      ON public.email_preferences
      FOR INSERT
      TO authenticated
      WITH CHECK (user_id = (SELECT auth.uid()));
  END IF;
END $$;

REVOKE ALL ON TABLE public.email_preferences FROM PUBLIC;
REVOKE ALL ON TABLE public.email_preferences FROM anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.email_preferences TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.email_preferences TO service_role;

-- Provisioning opt-in false à la création de compte (additif au trigger profiles).
CREATE OR REPLACE FUNCTION public.handle_new_user_email_preferences()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.email_preferences (user_id, marketing_opt_in)
  VALUES (NEW.id, false)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user_email_preferences() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_new_user_email_preferences() FROM anon;
REVOKE ALL ON FUNCTION public.handle_new_user_email_preferences() FROM authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created_email_preferences ON auth.users;
CREATE TRIGGER on_auth_user_created_email_preferences
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_email_preferences();

-- ---------------------------------------------------------------------------
-- 2) Suppressions (bounces / complaints / manual)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.email_suppressions (
  email text PRIMARY KEY,
  reason text NOT NULL,
  source text NOT NULL DEFAULT 'system',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT email_suppressions_email_not_blank_chk
    CHECK (length(btrim(email)) > 0),
  CONSTRAINT email_suppressions_reason_chk
    CHECK (reason IN ('hard_bounce', 'complaint', 'manual', 'unsub', 'soft_bounce_exhausted'))
);

COMMENT ON TABLE public.email_suppressions IS
  'Liste de suppression email. Bloque enqueue et send. service_role only.';

ALTER TABLE public.email_suppressions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.email_suppressions FROM PUBLIC;
REVOKE ALL ON TABLE public.email_suppressions FROM anon;
REVOKE ALL ON TABLE public.email_suppressions FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.email_suppressions TO service_role;

CREATE INDEX IF NOT EXISTS email_suppressions_created_at_idx
  ON public.email_suppressions (created_at DESC);

-- ---------------------------------------------------------------------------
-- 3) Outbox
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lifecycle_email_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id text NOT NULL,
  occurrence_key text NOT NULL DEFAULT '',
  recipient_email text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  scheduled_for timestamptz NOT NULL DEFAULT now(),
  claim_id uuid,
  claimed_at timestamptz,
  provider_message_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  CONSTRAINT lifecycle_email_outbox_campaign_chk
    CHECK (campaign_id IN ('welcome_h0', 'first_listing_h24', 'abandoned_draft_h24')),
  CONSTRAINT lifecycle_email_outbox_status_chk
    CHECK (status IN (
      'pending', 'processing', 'sent', 'failed', 'skipped', 'cancelled', 'uncertain'
    )),
  CONSTRAINT lifecycle_email_outbox_email_not_blank_chk
    CHECK (length(btrim(recipient_email)) > 0),
  CONSTRAINT lifecycle_email_outbox_attempts_nonneg_chk
    CHECK (attempts >= 0),
  CONSTRAINT lifecycle_email_outbox_unique_occurrence
    UNIQUE (user_id, campaign_id, occurrence_key)
);

COMMENT ON TABLE public.lifecycle_email_outbox IS
  'Outbox lifecycle. Idempotence par (user_id, campaign_id, occurrence_key). status uncertain = pas de retry auto.';

CREATE INDEX IF NOT EXISTS lifecycle_email_outbox_pending_sched_idx
  ON public.lifecycle_email_outbox (scheduled_for ASC, created_at ASC)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS lifecycle_email_outbox_stale_claim_idx
  ON public.lifecycle_email_outbox (claimed_at)
  WHERE claim_id IS NOT NULL AND status = 'processing';

CREATE INDEX IF NOT EXISTS lifecycle_email_outbox_user_sent_idx
  ON public.lifecycle_email_outbox (user_id, sent_at DESC)
  WHERE status = 'sent';

ALTER TABLE public.lifecycle_email_outbox ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.lifecycle_email_outbox FROM PUBLIC;
REVOKE ALL ON TABLE public.lifecycle_email_outbox FROM anon;
REVOKE ALL ON TABLE public.lifecycle_email_outbox FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.lifecycle_email_outbox TO service_role;

-- ---------------------------------------------------------------------------
-- 4) Events audit
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lifecycle_email_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outbox_id uuid REFERENCES public.lifecycle_email_outbox(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  campaign_id text,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lifecycle_email_events_type_chk
    CHECK (event_type IN (
      'enqueued', 'claimed', 'sent', 'failed', 'skipped', 'uncertain',
      'cancelled', 'unsubscribed', 'bounced', 'complained', 'clicked', 'converted'
    ))
);

CREATE INDEX IF NOT EXISTS lifecycle_email_events_outbox_idx
  ON public.lifecycle_email_events (outbox_id, created_at DESC);

CREATE INDEX IF NOT EXISTS lifecycle_email_events_user_idx
  ON public.lifecycle_email_events (user_id, created_at DESC);

ALTER TABLE public.lifecycle_email_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.lifecycle_email_events FROM PUBLIC;
REVOKE ALL ON TABLE public.lifecycle_email_events FROM anon;
REVOKE ALL ON TABLE public.lifecycle_email_events FROM authenticated;
GRANT SELECT, INSERT ON TABLE public.lifecycle_email_events TO service_role;

-- ---------------------------------------------------------------------------
-- 5) Attribution clics
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.email_attribution_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id text NOT NULL,
  occurrence_key text NOT NULL DEFAULT '',
  outbox_id uuid REFERENCES public.lifecycle_email_outbox(id) ON DELETE SET NULL,
  clicked_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  converted_at timestamptz,
  conversion_event text,
  CONSTRAINT email_attribution_sessions_status_chk
    CHECK (status IN ('pending', 'converted', 'expired')),
  CONSTRAINT email_attribution_sessions_campaign_chk
    CHECK (campaign_id IN ('welcome_h0', 'first_listing_h24', 'abandoned_draft_h24'))
);

CREATE INDEX IF NOT EXISTS email_attribution_sessions_user_pending_idx
  ON public.email_attribution_sessions (user_id, expires_at)
  WHERE status = 'pending';

ALTER TABLE public.email_attribution_sessions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.email_attribution_sessions FROM PUBLIC;
REVOKE ALL ON TABLE public.email_attribution_sessions FROM anon;
REVOKE ALL ON TABLE public.email_attribution_sessions FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.email_attribution_sessions TO service_role;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lifecycle_email_kill_switch_enabled()
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
      WHERE f.key = 'lifecycle_email_kill_switch'
      LIMIT 1
    ),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.lifecycle_email_kill_switch_enabled() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lifecycle_email_kill_switch_enabled() FROM anon;
REVOKE ALL ON FUNCTION public.lifecycle_email_kill_switch_enabled() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.lifecycle_email_kill_switch_enabled() TO service_role;

CREATE OR REPLACE FUNCTION public.lifecycle_email_is_suppressed(p_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.email_suppressions AS s
    WHERE lower(btrim(s.email)) = lower(btrim(p_email))
  );
$$;

REVOKE ALL ON FUNCTION public.lifecycle_email_is_suppressed(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lifecycle_email_is_suppressed(text) FROM anon;
REVOKE ALL ON FUNCTION public.lifecycle_email_is_suppressed(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.lifecycle_email_is_suppressed(text) TO service_role;

CREATE OR REPLACE FUNCTION public.lifecycle_email_user_within_frequency_cap(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  -- true = déjà envoyé dans les 7 jours → bloquer
  SELECT EXISTS (
    SELECT 1
    FROM public.lifecycle_email_outbox AS o
    WHERE o.user_id = p_user_id
      AND o.status = 'sent'
      AND o.sent_at IS NOT NULL
      AND o.sent_at > pg_catalog.now() - interval '7 days'
  );
$$;

REVOKE ALL ON FUNCTION public.lifecycle_email_user_within_frequency_cap(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lifecycle_email_user_within_frequency_cap(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.lifecycle_email_user_within_frequency_cap(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.lifecycle_email_user_within_frequency_cap(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.log_lifecycle_email_event(
  p_outbox_id uuid,
  p_user_id uuid,
  p_campaign_id text,
  p_event_type text,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.lifecycle_email_events (
    outbox_id, user_id, campaign_id, event_type, payload
  ) VALUES (
    p_outbox_id, p_user_id, p_campaign_id, p_event_type, coalesce(p_payload, '{}'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.log_lifecycle_email_event(uuid, uuid, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.log_lifecycle_email_event(uuid, uuid, text, text, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.log_lifecycle_email_event(uuid, uuid, text, text, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.log_lifecycle_email_event(uuid, uuid, text, text, jsonb) TO service_role;

-- ---------------------------------------------------------------------------
-- Revalidation consentement / exclusions au moment de l'envoi
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
  v_published boolean;
  v_draft_ok boolean;
BEGIN
  SELECT * INTO o FROM public.lifecycle_email_outbox AS x WHERE x.id = p_outbox_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'outbox_not_found', NULL::text, NULL::uuid, NULL::text, NULL::text, NULL::jsonb;
    RETURN;
  END IF;

  IF public.lifecycle_email_kill_switch_enabled() THEN
    RETURN QUERY SELECT false, 'kill_switch', o.recipient_email, o.user_id, o.campaign_id, o.occurrence_key, o.metadata;
    RETURN;
  END IF;

  SELECT * INTO pref FROM public.email_preferences AS p WHERE p.user_id = o.user_id;
  IF NOT FOUND OR pref.marketing_opt_in IS NOT TRUE OR pref.unsubscribed_at IS NOT NULL THEN
    RETURN QUERY SELECT false, 'no_consent', o.recipient_email, o.user_id, o.campaign_id, o.occurrence_key, o.metadata;
    RETURN;
  END IF;

  SELECT * INTO prof FROM public.profiles AS p WHERE p.id = o.user_id;
  IF FOUND AND prof.is_banned IS TRUE THEN
    RETURN QUERY SELECT false, 'banned', o.recipient_email, o.user_id, o.campaign_id, o.occurrence_key, o.metadata;
    RETURN;
  END IF;

  SELECT u.email INTO v_email
  FROM auth.users AS u
  WHERE u.id = o.user_id;

  IF v_email IS NULL OR length(btrim(v_email)) = 0 THEN
    RETURN QUERY SELECT false, 'no_email', o.recipient_email, o.user_id, o.campaign_id, o.occurrence_key, o.metadata;
    RETURN;
  END IF;

  IF public.lifecycle_email_is_suppressed(v_email) THEN
    RETURN QUERY SELECT false, 'suppressed', v_email, o.user_id, o.campaign_id, o.occurrence_key, o.metadata;
    RETURN;
  END IF;

  IF public.lifecycle_email_user_within_frequency_cap(o.user_id)
     AND o.status IS DISTINCT FROM 'sent' THEN
    -- Cap : un autre sent récent (pas celui-ci)
    IF EXISTS (
      SELECT 1 FROM public.lifecycle_email_outbox AS x
      WHERE x.user_id = o.user_id
        AND x.status = 'sent'
        AND x.id IS DISTINCT FROM o.id
        AND x.sent_at > pg_catalog.now() - interval '7 days'
    ) THEN
      RETURN QUERY SELECT false, 'frequency_cap', v_email, o.user_id, o.campaign_id, o.occurrence_key, o.metadata;
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
    SELECT EXISTS (
      SELECT 1 FROM public.listings AS l
      WHERE l.id::text = o.occurrence_key
        AND l.user_id = o.user_id
        AND l.status = 'draft'
        AND l.last_published_at IS NULL
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
BEGIN
  IF public.lifecycle_email_kill_switch_enabled() THEN
    RETURN 0;
  END IF;

  -- A) welcome_h0
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
      AND u.created_at <= pg_catalog.now()
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
      jsonb_build_object('locale', 'fr')
    FROM candidates AS c
    ON CONFLICT (user_id, campaign_id, occurrence_key) DO NOTHING
    RETURNING id, user_id
  )
  SELECT count(*) INTO n FROM ins;
  inserted := inserted + coalesce(n, 0);

  INSERT INTO public.lifecycle_email_events (outbox_id, user_id, campaign_id, event_type, payload)
  SELECT i.id, i.user_id, 'welcome_h0', 'enqueued', '{}'::jsonb
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

  -- B) first_listing_h24
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
      jsonb_build_object('locale', 'fr')
    FROM candidates AS c
    ON CONFLICT (user_id, campaign_id, occurrence_key) DO NOTHING
    RETURNING id, user_id
  )
  SELECT count(*) INTO n FROM ins;
  inserted := inserted + coalesce(n, 0);

  -- C) abandoned_draft_h24
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
      AND pref.marketing_opt_in IS TRUE
      AND pref.unsubscribed_at IS NULL
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
      jsonb_build_object('locale', 'fr', 'listing_id', c.listing_id, 'listing_title', c.listing_title)
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
-- Claim / complete
-- ---------------------------------------------------------------------------
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

CREATE OR REPLACE FUNCTION public.complete_lifecycle_email_claim(
  p_claim_id uuid,
  p_outbox_ids uuid[],
  p_outcome text,
  p_provider_message_id text DEFAULT NULL,
  p_error text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  updated integer := 0;
  max_attempts constant integer := 5;
BEGIN
  IF p_claim_id IS NULL
     OR p_outbox_ids IS NULL
     OR coalesce(array_length(p_outbox_ids, 1), 0) = 0 THEN
    RETURN 0;
  END IF;

  IF p_outcome = 'sent' THEN
    UPDATE public.lifecycle_email_outbox AS o
    SET
      status = 'sent',
      sent_at = pg_catalog.now(),
      provider_message_id = coalesce(p_provider_message_id, o.provider_message_id),
      last_error = NULL,
      claim_id = NULL,
      claimed_at = NULL
    WHERE o.id = ANY (p_outbox_ids)
      AND o.claim_id = p_claim_id
      AND o.status = 'processing';
  ELSIF p_outcome = 'skipped' THEN
    UPDATE public.lifecycle_email_outbox AS o
    SET
      status = 'skipped',
      last_error = p_error,
      claim_id = NULL,
      claimed_at = NULL
    WHERE o.id = ANY (p_outbox_ids)
      AND o.claim_id = p_claim_id
      AND o.status = 'processing';
  ELSIF p_outcome = 'uncertain' THEN
    -- Pas de retry auto : reconciliation manuelle / webhook.
    UPDATE public.lifecycle_email_outbox AS o
    SET
      status = 'uncertain',
      last_error = coalesce(p_error, 'provider_uncertain'),
      provider_message_id = coalesce(p_provider_message_id, o.provider_message_id),
      claim_id = NULL,
      claimed_at = NULL
    WHERE o.id = ANY (p_outbox_ids)
      AND o.claim_id = p_claim_id
      AND o.status = 'processing';
  ELSIF p_outcome = 'failed' THEN
    UPDATE public.lifecycle_email_outbox AS o
    SET
      status = CASE
        WHEN o.attempts >= max_attempts THEN 'failed'
        ELSE 'pending'
      END,
      last_error = p_error,
      scheduled_for = CASE
        WHEN o.attempts >= max_attempts THEN o.scheduled_for
        ELSE pg_catalog.now() + (least(o.attempts, 5) * interval '5 minutes')
      END,
      claim_id = NULL,
      claimed_at = NULL
    WHERE o.id = ANY (p_outbox_ids)
      AND o.claim_id = p_claim_id
      AND o.status = 'processing';
  ELSIF p_outcome = 'released' THEN
    UPDATE public.lifecycle_email_outbox AS o
    SET
      status = 'pending',
      claim_id = NULL,
      claimed_at = NULL,
      last_error = p_error
    WHERE o.id = ANY (p_outbox_ids)
      AND o.claim_id = p_claim_id
      AND o.status = 'processing';
  ELSE
    RAISE EXCEPTION 'invalid lifecycle email claim outcome'
      USING ERRCODE = '22023';
  END IF;

  GET DIAGNOSTICS updated = ROW_COUNT;
  RETURN updated;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_lifecycle_email_claim(uuid, uuid[], text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_lifecycle_email_claim(uuid, uuid[], text, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.complete_lifecycle_email_claim(uuid, uuid[], text, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.complete_lifecycle_email_claim(uuid, uuid[], text, text, text) TO service_role;

-- ---------------------------------------------------------------------------
-- Unsubscribe (service_role via Edge)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_lifecycle_unsubscribe(
  p_user_id uuid,
  p_email text,
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

  INSERT INTO public.email_preferences (user_id, marketing_opt_in, unsubscribed_at, marketing_opt_in_source)
  VALUES (p_user_id, false, pg_catalog.now(), 'unsubscribe')
  ON CONFLICT (user_id) DO UPDATE
  SET
    marketing_opt_in = false,
    unsubscribed_at = pg_catalog.now(),
    marketing_opt_in_source = 'unsubscribe',
    updated_at = pg_catalog.now();

  IF p_email IS NOT NULL AND length(btrim(p_email)) > 0 THEN
    INSERT INTO public.email_suppressions (email, reason, source)
    VALUES (lower(btrim(p_email)), 'unsub', coalesce(p_method, 'link'))
    ON CONFLICT (email) DO UPDATE
    SET reason = EXCLUDED.reason,
        source = EXCLUDED.source;
  END IF;

  PERFORM public.log_lifecycle_email_event(
    NULL,
    p_user_id,
    NULL,
    'unsubscribed',
    jsonb_build_object('method', coalesce(p_method, 'link'))
  );

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_lifecycle_unsubscribe(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_lifecycle_unsubscribe(uuid, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.apply_lifecycle_unsubscribe(uuid, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.apply_lifecycle_unsubscribe(uuid, text, text) TO service_role;

-- ---------------------------------------------------------------------------
-- Conversion : clôture attribution quand première publication
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.close_lifecycle_attribution_on_publish()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.last_published_at IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND OLD.last_published_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.email_attribution_sessions AS s
  SET
    status = 'converted',
    converted_at = pg_catalog.now(),
    conversion_event = CASE
      WHEN s.campaign_id = 'abandoned_draft_h24'
           AND s.occurrence_key = NEW.id::text THEN 'draft_published'
      ELSE 'listing_published'
    END
  WHERE s.user_id = NEW.user_id
    AND s.status = 'pending'
    AND s.expires_at >= pg_catalog.now()
    AND (
      s.campaign_id IN ('welcome_h0', 'first_listing_h24')
      OR (
        s.campaign_id = 'abandoned_draft_h24'
        AND s.occurrence_key = NEW.id::text
      )
    );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.close_lifecycle_attribution_on_publish() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.close_lifecycle_attribution_on_publish() FROM anon;
REVOKE ALL ON FUNCTION public.close_lifecycle_attribution_on_publish() FROM authenticated;

DROP TRIGGER IF EXISTS trg_lifecycle_attribution_on_publish ON public.listings;
CREATE TRIGGER trg_lifecycle_attribution_on_publish
  AFTER INSERT OR UPDATE OF last_published_at, status ON public.listings
  FOR EACH ROW
  WHEN (NEW.last_published_at IS NOT NULL)
  EXECUTE FUNCTION public.close_lifecycle_attribution_on_publish();

-- ---------------------------------------------------------------------------
-- Dispatch pg_net (secrets Vault hors git)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enqueue_lifecycle_email_dispatch()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  functions_url text;
  dispatch_secret text;
BEGIN
  IF public.lifecycle_email_kill_switch_enabled() THEN
    RETURN;
  END IF;

  -- GO staging (valeurs jamais commitées) :
  --   select vault.create_secret(
  --     'https://<PROJECT_REF>.supabase.co/functions/v1/send-lifecycle-email',
  --     'lifecycle_email_functions_url'
  --   );
  --   select vault.create_secret('<random-32-bytes>', 'lifecycle_email_dispatch_secret');
  SELECT ds.decrypted_secret INTO functions_url
  FROM vault.decrypted_secrets AS ds
  WHERE ds.name = 'lifecycle_email_functions_url'
  LIMIT 1;

  SELECT ds.decrypted_secret INTO dispatch_secret
  FROM vault.decrypted_secrets AS ds
  WHERE ds.name = 'lifecycle_email_dispatch_secret'
  LIMIT 1;

  IF functions_url IS NULL OR dispatch_secret IS NULL
     OR length(btrim(functions_url)) = 0
     OR length(btrim(dispatch_secret)) = 0 THEN
    RAISE WARNING 'lifecycle-email dispatch skipped: vault secrets missing';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := btrim(functions_url),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Lifecycle-Email-Dispatch-Secret', dispatch_secret
    ),
    body := '{}'::jsonb
  );
EXCEPTION
  WHEN undefined_table OR undefined_function OR invalid_schema_name THEN
    RAISE WARNING 'lifecycle-email dispatch skipped: pg_net or vault unavailable (%)', SQLERRM;
  WHEN OTHERS THEN
    RAISE WARNING 'lifecycle-email dispatch failed: %', SQLERRM;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_lifecycle_email_dispatch() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enqueue_lifecycle_email_dispatch() FROM anon;
REVOKE ALL ON FUNCTION public.enqueue_lifecycle_email_dispatch() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_lifecycle_email_dispatch() TO service_role;

-- Cron versionné (ne s’active qu’après application migration + Vault).
-- Extensions déjà requises par saved-search ; IF NOT EXISTS idempotent.
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.unschedule(j.jobid)
FROM cron.job AS j
WHERE j.jobname IN (
  'enqueue-lifecycle-emails',
  'dispatch-lifecycle-emails'
);

SELECT cron.schedule(
  'enqueue-lifecycle-emails',
  '*/30 * * * *',
  $cmd$SELECT public.enqueue_lifecycle_emails()$cmd$
);

SELECT cron.schedule(
  'dispatch-lifecycle-emails',
  '*/5 * * * *',
  $cmd$SELECT public.enqueue_lifecycle_email_dispatch()$cmd$
);
