-- Lot 05A RC : kill switch fail-closed si la row flag est absente.
-- Avant : coalesce(..., false) → envois possibles après DELETE accidentel du flag.
-- Après : coalesce(..., true) → aucun claim/enqueue/send sans flag explicite à 'false'.

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
    true
  );
$$;

REVOKE ALL ON FUNCTION public.lifecycle_email_kill_switch_enabled() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lifecycle_email_kill_switch_enabled() FROM anon;
REVOKE ALL ON FUNCTION public.lifecycle_email_kill_switch_enabled() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.lifecycle_email_kill_switch_enabled() TO service_role;

-- Garantit la présence de la row (idempotent).
INSERT INTO public.app_runtime_flags (key, value)
VALUES ('lifecycle_email_kill_switch', 'true')
ON CONFLICT (key) DO NOTHING;
