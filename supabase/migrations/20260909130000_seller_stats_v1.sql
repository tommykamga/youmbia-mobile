-- TOM-98 Lot C — Statistiques vendeur essentielles.
--
-- Architecture sécurité :
-- - public.get_my_seller_stats() = façade Data API SECURITY INVOKER ;
-- - private.get_my_seller_stats_internal() = agrégation SECURITY DEFINER ;
-- - aucun user_id fourni par le client ;
-- - identité exclusivement dérivée de auth.uid() ;
-- - aucun assouplissement de la RLS favorites.

CREATE SCHEMA IF NOT EXISTS private;

REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated;

CREATE OR REPLACE FUNCTION private.get_my_seller_stats_internal()
RETURNS TABLE (
  active_listings bigint,
  sold_listings bigint,
  draft_listings bigint,
  paused_listings bigint,
  favorites_received bigint,
  sold_last_30_days bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH current_seller AS (
    SELECT (SELECT auth.uid()) AS user_id
  ),
  my_listings AS (
    SELECT
      l.id,
      l.status,
      l.sold_at
    FROM public.listings AS l
    CROSS JOIN current_seller AS s
    WHERE s.user_id IS NOT NULL
      AND l.user_id = s.user_id
  ),
  listing_totals AS (
    SELECT
      COUNT(*) FILTER (WHERE status = 'active')::bigint AS active_listings,
      COUNT(*) FILTER (WHERE status = 'sold')::bigint AS sold_listings,
      COUNT(*) FILTER (WHERE status = 'draft')::bigint AS draft_listings,
      COUNT(*) FILTER (WHERE status = 'hidden')::bigint AS paused_listings,
      COUNT(*) FILTER (
        WHERE status = 'sold'
          AND sold_at IS NOT NULL
          AND sold_at >= now() - interval '30 days'
      )::bigint AS sold_last_30_days
    FROM my_listings
  ),
  favorite_totals AS (
    SELECT COUNT(f.id)::bigint AS favorites_received
    FROM public.favorites AS f
    INNER JOIN my_listings AS l
      ON l.id = f.listing_id
  )
  SELECT
    lt.active_listings,
    lt.sold_listings,
    lt.draft_listings,
    lt.paused_listings,
    ft.favorites_received,
    lt.sold_last_30_days
  FROM listing_totals AS lt
  CROSS JOIN favorite_totals AS ft;
$$;

REVOKE ALL
ON FUNCTION private.get_my_seller_stats_internal()
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION private.get_my_seller_stats_internal()
TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_seller_stats()
RETURNS TABLE (
  active_listings bigint,
  sold_listings bigint,
  draft_listings bigint,
  paused_listings bigint,
  favorites_received bigint,
  sold_last_30_days bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT *
  FROM private.get_my_seller_stats_internal();
$$;

COMMENT ON FUNCTION public.get_my_seller_stats() IS
  'TOM-98 Lot C: statistiques agrégées du vendeur authentifié uniquement. Aucun user_id client.';

REVOKE ALL
ON FUNCTION public.get_my_seller_stats()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public.get_my_seller_stats()
FROM anon;

GRANT EXECUTE
ON FUNCTION public.get_my_seller_stats()
TO authenticated;
