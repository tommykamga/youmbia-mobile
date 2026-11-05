-- V5-03B : classement Découverte déterministe.
-- Aucun changement des clients 4.7.x.
-- Aucun changement des données existantes.

CREATE OR REPLACE FUNCTION public.get_v5_discovery_listing_ids(
  p_offset integer DEFAULT 0,
  p_limit integer DEFAULT 20
)
RETURNS TABLE(listing_id uuid, rank_position bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH candidates AS (
    SELECT
      l.id,
      l.user_id,
      l.boosted,
      l.created_at,
      l.last_published_at,
      ROW_NUMBER() OVER (
        PARTITION BY l.user_id
        ORDER BY l.last_published_at DESC NULLS LAST, l.id DESC
      ) AS seller_position
    FROM public.listings l
    WHERE l.status = 'active'
  ),
  ranked AS (
    SELECT
      c.id,
      ROW_NUMBER() OVER (
        ORDER BY
          c.boosted DESC NULLS LAST,
          c.seller_position ASC,
          c.last_published_at DESC NULLS LAST,
          c.id DESC
      ) AS global_position
    FROM candidates c
  )
  SELECT r.id, r.global_position
  FROM ranked r
  ORDER BY r.global_position
  OFFSET GREATEST(p_offset, 0)
  LIMIT LEAST(GREATEST(p_limit, 1), 50);
$$;

REVOKE ALL ON FUNCTION public.get_v5_discovery_listing_ids(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_v5_discovery_listing_ids(integer, integer)
TO anon, authenticated;
