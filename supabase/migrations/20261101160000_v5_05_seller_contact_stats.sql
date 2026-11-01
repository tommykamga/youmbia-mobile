-- V5-05 — Intentions de contact reçues par le vendeur.
-- Lecture agrégée uniquement. Aucune donnée personnelle exposée.

CREATE FUNCTION public.get_v5_my_contact_intent_stats()
RETURNS TABLE(channel text, intent_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    i.channel,
    count(*)::bigint AS intent_count
  FROM public.marketplace_contact_intents i
  JOIN public.listings l ON l.id = i.listing_id
  WHERE
    auth.uid() IS NOT NULL
    AND l.user_id = auth.uid()
    AND i.received_at >= now() - interval '30 days'
  GROUP BY i.channel
  ORDER BY i.channel;
$$;

REVOKE ALL ON FUNCTION public.get_v5_my_contact_intent_stats()
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_v5_my_contact_intent_stats()
TO authenticated;
