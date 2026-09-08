-- Saved searches + alertes « nouvelle annonce » V1.
-- Additive / backward-compatible. NE PAS APPLIQUER en prod avant GO.
--
-- Source de vérité : public.saved_searches (colonnes structurées, pas de blob filters).
-- Matching : trigger AFTER INSERT ON listings WHEN (NEW.status = 'active').
--   Interdit : UPDATE, renewal, édition, hidden→active, sold→active.
--   pas de trigger sur renewed_at / UPDATE.
-- Ledger : public.saved_search_matches UNIQUE (saved_search_id, listing_id).
-- Push immédiat : pg_net → Edge Function dispatch-saved-search-alerts → Expo.
-- Retry : pg_cron */5 * * * * obligatoire (pg_cron + pg_net : FAIL migration si install impossible).
-- Claim atomique : claim_saved_search_alerts empêche le double push pg_net + cron.
-- Expiration 24h : expired_at = now() (jamais notified_at).
-- createListing() n’est PAS dans le pipeline.

-- ---------------------------------------------------------------------------
-- 1) saved_searches
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.saved_searches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text,
  query text NOT NULL DEFAULT '',
  category_id integer REFERENCES public.categories(id) ON DELETE RESTRICT,
  city text,
  min_price integer,
  max_price integer,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT saved_searches_min_price_nonneg_chk
    CHECK (min_price IS NULL OR min_price >= 0),
  CONSTRAINT saved_searches_max_price_nonneg_chk
    CHECK (max_price IS NULL OR max_price >= 0),
  CONSTRAINT saved_searches_price_range_chk
    CHECK (min_price IS NULL OR max_price IS NULL OR min_price <= max_price),
  CONSTRAINT saved_searches_has_criteria_chk
    CHECK (
      length(trim(query)) > 0
      OR category_id IS NOT NULL
      OR city IS NOT NULL
      OR min_price IS NOT NULL
      OR max_price IS NOT NULL
    ),
  CONSTRAINT saved_searches_city_not_blank_chk
    CHECK (city IS NULL OR length(btrim(city)) > 0)
);

COMMENT ON TABLE public.saved_searches IS
  'Recherches sauvegardées par utilisateur. Critères = filtres Search réels (query, category_id, city, min/max price). Pas de tri, pas de condition, pas de jsonb opaque.';

CREATE UNIQUE INDEX IF NOT EXISTS saved_searches_user_criteria_uidx
  ON public.saved_searches (
    user_id,
    lower(btrim(query)),
    coalesce(category_id, 0),
    lower(coalesce(city, '')),
    coalesce(min_price, -1),
    coalesce(max_price, -1)
  );

CREATE INDEX IF NOT EXISTS saved_searches_user_id_idx
  ON public.saved_searches (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS saved_searches_enabled_user_idx
  ON public.saved_searches (user_id)
  WHERE enabled;

CREATE INDEX IF NOT EXISTS saved_searches_enabled_category_idx
  ON public.saved_searches (category_id)
  WHERE enabled;

ALTER TABLE public.saved_searches ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'saved_searches'
      AND policyname = 'saved_searches_select_own'
  ) THEN
    CREATE POLICY saved_searches_select_own
      ON public.saved_searches
      FOR SELECT
      TO authenticated
      USING (user_id = (SELECT auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'saved_searches'
      AND policyname = 'saved_searches_insert_own'
  ) THEN
    CREATE POLICY saved_searches_insert_own
      ON public.saved_searches
      FOR INSERT
      TO authenticated
      WITH CHECK (user_id = (SELECT auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'saved_searches'
      AND policyname = 'saved_searches_update_own'
  ) THEN
    CREATE POLICY saved_searches_update_own
      ON public.saved_searches
      FOR UPDATE
      TO authenticated
      USING (user_id = (SELECT auth.uid()))
      WITH CHECK (user_id = (SELECT auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'saved_searches'
      AND policyname = 'saved_searches_delete_own'
  ) THEN
    CREATE POLICY saved_searches_delete_own
      ON public.saved_searches
      FOR DELETE
      TO authenticated
      USING (user_id = (SELECT auth.uid()));
  END IF;
END $$;

REVOKE ALL ON TABLE public.saved_searches FROM PUBLIC;
REVOKE ALL ON TABLE public.saved_searches FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_searches TO authenticated;

CREATE OR REPLACE FUNCTION public.saved_searches_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := pg_catalog.now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_saved_searches_set_updated_at ON public.saved_searches;
CREATE TRIGGER trg_saved_searches_set_updated_at
  BEFORE UPDATE ON public.saved_searches
  FOR EACH ROW
  EXECUTE FUNCTION public.saved_searches_set_updated_at();

CREATE OR REPLACE FUNCTION public.saved_searches_enforce_limit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF (
    SELECT count(*) FROM public.saved_searches WHERE user_id = NEW.user_id
  ) >= 20 THEN
    RAISE EXCEPTION 'Vous pouvez enregistrer au maximum 20 recherches.'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_saved_searches_enforce_limit ON public.saved_searches;
CREATE TRIGGER trg_saved_searches_enforce_limit
  BEFORE INSERT ON public.saved_searches
  FOR EACH ROW
  EXECUTE FUNCTION public.saved_searches_enforce_limit();

REVOKE ALL ON FUNCTION public.saved_searches_set_updated_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.saved_searches_set_updated_at() FROM anon;
REVOKE ALL ON FUNCTION public.saved_searches_set_updated_at() FROM authenticated;

REVOKE ALL ON FUNCTION public.saved_searches_enforce_limit() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.saved_searches_enforce_limit() FROM anon;
REVOKE ALL ON FUNCTION public.saved_searches_enforce_limit() FROM authenticated;

-- ---------------------------------------------------------------------------
-- 2) Ledger serveur (non falsifiable côté client)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.saved_search_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  saved_search_id uuid NOT NULL REFERENCES public.saved_searches(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  matched_at timestamptz NOT NULL DEFAULT now(),
  notified_at timestamptz,
  expired_at timestamptz,
  dispatch_claimed_at timestamptz,
  dispatch_claim_id uuid,
  CONSTRAINT saved_search_matches_unique UNIQUE (saved_search_id, listing_id)
);

ALTER TABLE public.saved_search_matches
  ADD COLUMN IF NOT EXISTS expired_at timestamptz,
  ADD COLUMN IF NOT EXISTS dispatch_claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS dispatch_claim_id uuid;

COMMENT ON TABLE public.saved_search_matches IS
  'Ledger serveur : un couple (saved_search, listing) notifié au plus une fois. Claim atomique anti double-push. Aucun INSERT/UPDATE client.';

COMMENT ON COLUMN public.saved_search_matches.notified_at IS
  'Push Expo envoyé, ou clôture zéro token. Jamais utilisé pour une expiration.';

COMMENT ON COLUMN public.saved_search_matches.expired_at IS
  'Pending trop vieux (>24h) ou inéligible. Une expiration n’est pas une notification.';

DROP INDEX IF EXISTS public.saved_search_matches_listing_id_idx;
DROP INDEX IF EXISTS public.saved_search_matches_pending_matched_at_idx;

CREATE INDEX IF NOT EXISTS saved_search_matches_pending_listing_idx
  ON public.saved_search_matches (listing_id, matched_at)
  WHERE notified_at IS NULL AND expired_at IS NULL;

CREATE INDEX IF NOT EXISTS saved_search_matches_stale_claim_idx
  ON public.saved_search_matches (dispatch_claimed_at)
  WHERE dispatch_claim_id IS NOT NULL
    AND notified_at IS NULL
    AND expired_at IS NULL;

ALTER TABLE public.saved_search_matches ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.saved_search_matches FROM PUBLIC;
REVOKE ALL ON TABLE public.saved_search_matches FROM anon;
REVOKE ALL ON TABLE public.saved_search_matches FROM authenticated;
REVOKE ALL ON TABLE public.saved_search_matches FROM service_role;

-- ---------------------------------------------------------------------------
-- 3) Matching (mêmes règles que Search : tokens AND, ville ILIKE, prix, branche catégorie)
--    Pas de matching boutique : l’alerte porte sur l’annonce, pas le nom de shop.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.saved_search_normalize_text(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT replace(
    replace(
      translate(
        lower(trim(coalesce(p_text, ''))),
        'àáâäãåçèéêëìíîïñòóôöõùúûüýÿ',
        'aaaaaaceeeeiiiinooooouuuuyy'
      ),
      'œ',
      'oe'
    ),
    'æ',
    'ae'
  );
$$;

CREATE OR REPLACE FUNCTION public.saved_search_tokenize_query(p_query text)
RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  normalized text;
  part text;
  seen text[] := ARRAY[]::text[];
  tokens text[] := ARRAY[]::text[];
  stopwords text[] := ARRAY['de','la','le','les','du','des','et','un','une','en','au','aux'];
BEGIN
  normalized := public.saved_search_normalize_text(p_query);
  IF normalized = '' THEN
    RETURN tokens;
  END IF;

  FOREACH part IN ARRAY regexp_split_to_array(normalized, '[^a-z0-9]+')
  LOOP
    IF length(part) < 2 THEN
      CONTINUE;
    END IF;
    IF part = ANY (stopwords) THEN
      CONTINUE;
    END IF;
    IF part = ANY (seen) THEN
      CONTINUE;
    END IF;
    seen := array_append(seen, part);
    tokens := array_append(tokens, part);
  END LOOP;

  RETURN tokens;
END;
$$;

CREATE OR REPLACE FUNCTION public.saved_search_category_branch_ids(p_category_id integer)
RETURNS integer[]
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  WITH RECURSIVE branch AS (
    SELECT c.id FROM public.categories c WHERE c.id = p_category_id
    UNION ALL
    SELECT c.id
    FROM public.categories c
    INNER JOIN branch b ON c.parent_id = b.id
  )
  SELECT COALESCE(
    (SELECT array_agg(id) FROM branch),
    ARRAY[p_category_id]
  );
$$;

CREATE OR REPLACE FUNCTION public.listing_matches_saved_search(
  p_listing public.listings,
  p_search public.saved_searches
) RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  tokens text[];
  token text;
  haystack text;
  branch_ids integer[];
  listing_city text;
  search_city text;
BEGIN
  IF NOT p_search.enabled THEN
    RETURN false;
  END IF;
  IF p_listing.status IS DISTINCT FROM 'active' THEN
    RETURN false;
  END IF;
  IF p_listing.user_id IS NOT DISTINCT FROM p_search.user_id THEN
    RETURN false;
  END IF;

  IF p_search.category_id IS NOT NULL THEN
    branch_ids := public.saved_search_category_branch_ids(p_search.category_id);
    IF p_listing.category_id IS NULL OR NOT (p_listing.category_id = ANY (branch_ids)) THEN
      RETURN false;
    END IF;
  END IF;

  search_city := public.saved_search_normalize_text(p_search.city);
  IF search_city <> '' THEN
    listing_city := public.saved_search_normalize_text(p_listing.city);
    IF position(search_city IN listing_city) = 0 THEN
      RETURN false;
    END IF;
  END IF;

  IF p_search.min_price IS NOT NULL AND p_listing.price < p_search.min_price THEN
    RETURN false;
  END IF;
  IF p_search.max_price IS NOT NULL AND p_listing.price > p_search.max_price THEN
    RETURN false;
  END IF;

  tokens := public.saved_search_tokenize_query(p_search.query);
  IF coalesce(array_length(tokens, 1), 0) > 0 THEN
    haystack := public.saved_search_normalize_text(
      coalesce(p_listing.title, '') || ' ' ||
      coalesce(p_listing.city, '') || ' ' ||
      coalesce(p_listing.description, '')
    );
    FOREACH token IN ARRAY tokens LOOP
      IF position(token IN haystack) = 0 THEN
        RETURN false;
      END IF;
    END LOOP;
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.saved_search_normalize_text(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.saved_search_normalize_text(text) FROM anon;
REVOKE ALL ON FUNCTION public.saved_search_normalize_text(text) FROM authenticated;

REVOKE ALL ON FUNCTION public.saved_search_tokenize_query(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.saved_search_tokenize_query(text) FROM anon;
REVOKE ALL ON FUNCTION public.saved_search_tokenize_query(text) FROM authenticated;

REVOKE ALL ON FUNCTION public.saved_search_category_branch_ids(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.saved_search_category_branch_ids(integer) FROM anon;
REVOKE ALL ON FUNCTION public.saved_search_category_branch_ids(integer) FROM authenticated;

REVOKE ALL ON FUNCTION public.listing_matches_saved_search(public.listings, public.saved_searches) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.listing_matches_saved_search(public.listings, public.saved_searches) FROM anon;
REVOKE ALL ON FUNCTION public.listing_matches_saved_search(public.listings, public.saved_searches) FROM authenticated;

-- ---------------------------------------------------------------------------
-- 4) Trigger AFTER INSERT uniquement (pas d’UPDATE / pas de renewal)
--    WHEN status = active : INSERT hidden/sold/suspended n’entre pas.
--    AFTER INSERT = nouvelle ligne : pas de garde-fou created_at < 1 h.
--    Pas de LIMIT : on ne perd aucun match (plafond produit = 20 recherches / user).
--    pg_net + pg_cron : requis. CREATE EXTENSION hors DO : un échec FAIL la migration.
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public.enqueue_saved_search_alert_dispatch(p_listing_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  functions_url text;
  dispatch_secret text;
BEGIN
  -- Secrets hors git. GO (SQL editor, valeurs jamais commitées) :
  --   select vault.create_secret(
  --     'https://<PROJECT_REF>.supabase.co/functions/v1/dispatch-saved-search-alerts',
  --     'saved_search_functions_url'
  --   );
  --   select vault.create_secret('<random-32-bytes>', 'saved_search_dispatch_secret');
  -- Edge Function secret SAVED_SEARCH_DISPATCH_SECRET = même valeur que vault.
  SELECT ds.decrypted_secret INTO functions_url
  FROM vault.decrypted_secrets AS ds
  WHERE ds.name = 'saved_search_functions_url'
  LIMIT 1;

  SELECT ds.decrypted_secret INTO dispatch_secret
  FROM vault.decrypted_secrets AS ds
  WHERE ds.name = 'saved_search_dispatch_secret'
  LIMIT 1;

  IF functions_url IS NULL OR dispatch_secret IS NULL
     OR length(btrim(functions_url)) = 0
     OR length(btrim(dispatch_secret)) = 0 THEN
    RAISE WARNING 'saved-search dispatch skipped: vault secrets missing';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := btrim(functions_url),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Saved-Search-Dispatch-Secret', dispatch_secret
    ),
    body := jsonb_build_object('listing_id', p_listing_id)
  );
EXCEPTION
  WHEN undefined_table OR undefined_function OR invalid_schema_name THEN
    RAISE WARNING 'saved-search dispatch skipped: pg_net or vault unavailable (%)', SQLERRM;
  WHEN OTHERS THEN
    -- Ne jamais faire échouer l’INSERT listing ni le cron.
    RAISE WARNING 'saved-search dispatch failed: %', SQLERRM;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_saved_search_alert_dispatch(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enqueue_saved_search_alert_dispatch(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.enqueue_saved_search_alert_dispatch(uuid) FROM authenticated;

CREATE OR REPLACE FUNCTION public.listings_match_saved_searches()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  inserted_count integer := 0;
BEGIN
  INSERT INTO public.saved_search_matches (saved_search_id, listing_id)
  SELECT s.id, NEW.id
  FROM public.saved_searches AS s
  WHERE s.enabled
    AND s.user_id IS DISTINCT FROM NEW.user_id
    AND public.listing_matches_saved_search(NEW, s)
  ON CONFLICT (saved_search_id, listing_id) DO NOTHING;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;

  IF inserted_count > 0 THEN
    PERFORM public.enqueue_saved_search_alert_dispatch(NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.listings_match_saved_searches() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.listings_match_saved_searches() FROM anon;
REVOKE ALL ON FUNCTION public.listings_match_saved_searches() FROM authenticated;

DROP TRIGGER IF EXISTS trg_listings_match_saved_searches ON public.listings;
CREATE TRIGGER trg_listings_match_saved_searches
  AFTER INSERT ON public.listings
  FOR EACH ROW
  WHEN (NEW.status = 'active')
  EXECUTE FUNCTION public.listings_match_saved_searches();

-- ---------------------------------------------------------------------------
-- 5) Claim atomique : pg_net immédiat + cron ne peuvent pas pousser deux fois.
--    Stale claim (> 10 min) : crash dispatcher → reclaim.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_saved_search_alerts(
  p_listing_id uuid,
  p_claim_id uuid
)
RETURNS TABLE (
  id uuid,
  saved_search_id uuid,
  listing_id uuid,
  user_id uuid,
  enabled boolean,
  name text,
  query text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_listing_id IS NULL OR p_claim_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH claimable AS (
    SELECT m.id
    FROM public.saved_search_matches AS m
    WHERE m.listing_id = p_listing_id
      AND m.notified_at IS NULL
      AND m.expired_at IS NULL
      AND (
        m.dispatch_claim_id IS NULL
        OR m.dispatch_claimed_at IS NULL
        OR m.dispatch_claimed_at < pg_catalog.now() - interval '10 minutes'
      )
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.saved_search_matches AS m
  SET
    dispatch_claim_id = p_claim_id,
    dispatch_claimed_at = pg_catalog.now()
  FROM claimable AS c, public.saved_searches AS s
  WHERE m.id = c.id
    AND s.id = m.saved_search_id
    AND m.notified_at IS NULL
    AND m.expired_at IS NULL
    AND (
      m.dispatch_claim_id IS NULL
      OR m.dispatch_claimed_at IS NULL
      OR m.dispatch_claimed_at < pg_catalog.now() - interval '10 minutes'
    )
  RETURNING
    m.id,
    m.saved_search_id,
    m.listing_id,
    s.user_id,
    s.enabled,
    s.name,
    s.query;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_saved_search_alert_claim(
  p_claim_id uuid,
  p_match_ids uuid[],
  p_outcome text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  updated integer := 0;
BEGIN
  IF p_claim_id IS NULL
     OR p_match_ids IS NULL
     OR coalesce(array_length(p_match_ids, 1), 0) = 0 THEN
    RETURN 0;
  END IF;

  IF p_outcome = 'notified' THEN
    UPDATE public.saved_search_matches AS m
    SET
      notified_at = pg_catalog.now(),
      dispatch_claim_id = NULL,
      dispatch_claimed_at = NULL
    WHERE m.id = ANY (p_match_ids)
      AND m.dispatch_claim_id = p_claim_id
      AND m.notified_at IS NULL
      AND m.expired_at IS NULL;
  ELSIF p_outcome = 'expired' THEN
    UPDATE public.saved_search_matches AS m
    SET
      expired_at = pg_catalog.now(),
      dispatch_claim_id = NULL,
      dispatch_claimed_at = NULL
    WHERE m.id = ANY (p_match_ids)
      AND m.dispatch_claim_id = p_claim_id
      AND m.notified_at IS NULL
      AND m.expired_at IS NULL;
  ELSIF p_outcome = 'released' THEN
    UPDATE public.saved_search_matches AS m
    SET
      dispatch_claim_id = NULL,
      dispatch_claimed_at = NULL
    WHERE m.id = ANY (p_match_ids)
      AND m.dispatch_claim_id = p_claim_id
      AND m.notified_at IS NULL
      AND m.expired_at IS NULL;
  ELSE
    RAISE EXCEPTION 'invalid saved-search claim outcome'
      USING ERRCODE = '22023';
  END IF;

  GET DIAGNOSTICS updated = ROW_COUNT;
  RETURN updated;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_saved_search_alerts(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_saved_search_alerts(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.claim_saved_search_alerts(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_saved_search_alerts(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.complete_saved_search_alert_claim(uuid, uuid[], text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_saved_search_alert_claim(uuid, uuid[], text) FROM anon;
REVOKE ALL ON FUNCTION public.complete_saved_search_alert_claim(uuid, uuid[], text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.complete_saved_search_alert_claim(uuid, uuid[], text) TO service_role;

-- ---------------------------------------------------------------------------
-- 6) Retry serveur : pg_cron toutes les 5 minutes (filet, pas le chemin nominal).
--    Requis : CREATE EXTENSION pg_cron plus haut a déjà FAIL si indisponible.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.retry_pending_saved_search_alerts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  listing_row record;
  dispatched integer := 0;
BEGIN
  -- Expiration : pending > 24 h → expired_at, jamais notified_at.
  UPDATE public.saved_search_matches AS m
  SET
    expired_at = pg_catalog.now(),
    dispatch_claim_id = NULL,
    dispatch_claimed_at = NULL
  WHERE m.notified_at IS NULL
    AND m.expired_at IS NULL
    AND m.matched_at < pg_catalog.now() - interval '24 hours';

  FOR listing_row IN
    SELECT m.listing_id
    FROM public.saved_search_matches AS m
    WHERE m.notified_at IS NULL
      AND m.expired_at IS NULL
      AND m.matched_at >= pg_catalog.now() - interval '24 hours'
      AND (
        m.dispatch_claim_id IS NULL
        OR m.dispatch_claimed_at IS NULL
        OR m.dispatch_claimed_at < pg_catalog.now() - interval '10 minutes'
      )
    GROUP BY m.listing_id
    ORDER BY min(m.matched_at) ASC
    LIMIT 100
  LOOP
    PERFORM public.enqueue_saved_search_alert_dispatch(listing_row.listing_id);
    dispatched := dispatched + 1;
  END LOOP;

  RETURN dispatched;
END;
$$;

REVOKE ALL ON FUNCTION public.retry_pending_saved_search_alerts() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.retry_pending_saved_search_alerts() FROM anon;
REVOKE ALL ON FUNCTION public.retry_pending_saved_search_alerts() FROM authenticated;

SELECT cron.unschedule(j.jobid)
FROM cron.job AS j
WHERE j.jobname = 'retry-saved-search-alerts';

SELECT cron.schedule(
  'retry-saved-search-alerts',
  '*/5 * * * *',
  $cmd$SELECT public.retry_pending_saved_search_alerts()$cmd$
);

-- Database Webhook dashboard : redondant avec pg_net versionné ici, ne pas en ajouter un second.
