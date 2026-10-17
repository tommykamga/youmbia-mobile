-- Préparation rappels brouillon (abandoned_draft_h24) — sans activation service.
-- Killcritic : mode service indépendant de marketing_opt_in NON activé.
-- Comptes historiques : l’âge du compte n’est PAS un filtre d’éligibilité draft
--   (seul listings.created_at >= cutoff anti-masse s’applique aux brouillons existants).
-- Rétro-application massive des anciens brouillons : INTERDITE ici.

-- Flag d’activation service (OFF). Ne pas basculer sans qualification juridique + info préalable.
INSERT INTO public.app_runtime_flags (key, value)
VALUES ('lifecycle_draft_reminders_as_service', 'false')
ON CONFLICT (key) DO NOTHING;

COMMENT ON TABLE public.app_runtime_flags IS
  'Flags serveur. lifecycle_draft_reminders_as_service=false tant que la base légale service + info préalable ne sont pas établies.';

-- Preuve d’information préalable au niveau utilisateur (parcours enregistrement brouillon).
ALTER TABLE public.email_preferences
  ADD COLUMN IF NOT EXISTS draft_reminders_notice_acknowledged_at timestamptz;

COMMENT ON COLUMN public.email_preferences.draft_reminders_notice_acknowledged_at IS
  'Horodatage d’ack de l’information sur les rappels facultatifs de brouillon. Requis avant toute activation service future. N’implique pas d’opt-in marketing.';

COMMENT ON COLUMN public.email_preferences.optional_draft_reminders_opt_out IS
  'Opposition spécifique aux rappels de brouillon (indépendante de marketing_opt_in). Défaut false = rappels autorisés si autres règles OK.';

-- Helper lecture flag (service OFF par défaut / fail-closed si absent)
CREATE OR REPLACE FUNCTION public.lifecycle_draft_reminders_as_service_enabled()
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
      WHERE f.key = 'lifecycle_draft_reminders_as_service'
      LIMIT 1
    ),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.lifecycle_draft_reminders_as_service_enabled() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lifecycle_draft_reminders_as_service_enabled() FROM anon;
REVOKE ALL ON FUNCTION public.lifecycle_draft_reminders_as_service_enabled() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.lifecycle_draft_reminders_as_service_enabled() TO service_role;

-- Ack notice (service_role / authenticated via RLS update own)
CREATE OR REPLACE FUNCTION public.acknowledge_lifecycle_draft_reminders_notice(
  p_user_id uuid
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
  -- Authenticated (JWT) : uniquement soi-même.
  -- Sans JWT (service_role / harness local) : auth.uid() NULL → autorisé.
  IF coalesce((SELECT auth.uid()), p_user_id) IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'acknowledge_lifecycle_draft_reminders_notice: forbidden'
      USING ERRCODE = '42501';
  END IF;
  -- Ne remplace jamais un ack existant (première information conservée).
  INSERT INTO public.email_preferences (
    user_id, marketing_opt_in, draft_reminders_notice_acknowledged_at
  )
  VALUES (p_user_id, false, pg_catalog.now())
  ON CONFLICT (user_id) DO UPDATE
  SET
    draft_reminders_notice_acknowledged_at = coalesce(
      public.email_preferences.draft_reminders_notice_acknowledged_at,
      EXCLUDED.draft_reminders_notice_acknowledged_at
    ),
    updated_at = pg_catalog.now();

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.acknowledge_lifecycle_draft_reminders_notice(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.acknowledge_lifecycle_draft_reminders_notice(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.acknowledge_lifecycle_draft_reminders_notice(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.acknowledge_lifecycle_draft_reminders_notice(uuid) TO service_role;

-- Enqueue abandoned_draft : clarifier commentaires métier uniquement.
-- Éligibilité ACTIVE reste marketing_opt_in (service flag OFF).
-- Pas de filtre sur auth.users.created_at → comptes historiques OK pour NOUVEAUX brouillons.
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

  -- A) welcome_h0 — SERVICE (inchangé vs 20261017220000)
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

  -- C) abandoned_draft_h24
  -- Canal ACTIF = marketing (flag service OFF).
  -- Comptes historiques : PAS de filtre u.created_at — un nouveau brouillon post-cutoff est éligible.
  -- Anciens brouillons (listings.created_at < cutoff) : exclus (pas de rétro masse).
  -- Service indépendant de marketing_opt_in : NON activé (voir lifecycle_draft_reminders_as_service).
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
      -- Canal service indépendant de marketing_opt_in : NON câblé ici.
      -- lifecycle_draft_reminders_as_service_enabled() reste false jusqu’à migration dédiée + GO juridique.
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
