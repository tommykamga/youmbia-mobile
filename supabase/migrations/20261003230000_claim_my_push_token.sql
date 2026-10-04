-- P0 push registration: claim one Expo token for the authenticated user.
-- The token is globally unique. A narrowly-scoped SECURITY DEFINER function is
-- required so a device can be reassigned after an interrupted/offline logout
-- without weakening the owner-only table policies.

begin;

CREATE OR REPLACE FUNCTION public.claim_my_push_token(
  p_expo_push_token text,
  p_platform text,
  p_previous_expo_push_token text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_token text := coalesce(p_expo_push_token, '');
  v_previous_token text := btrim(coalesce(p_previous_expo_push_token, ''));
  v_platform text := lower(btrim(coalesce(p_platform, '')));
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  -- Conservative validation: keep both documented Expo prefixes and leave the
  -- inner alphabet evolvable, while bounding storage and rejecting whitespace,
  -- controls, nested brackets, empty payloads, and surrounding junk.
  IF p_expo_push_token IS NULL
     OR octet_length(v_token) < 16
     OR octet_length(v_token) > 512
     OR v_token !~ '^(ExponentPushToken|ExpoPushToken)\[[^][]+\]$'
     OR v_token ~ '[[:space:][:cntrl:]]' THEN
    RAISE EXCEPTION 'invalid Expo push token' USING ERRCODE = '22023';
  END IF;

  IF v_platform NOT IN ('android', 'ios') THEN
    RAISE EXCEPTION 'invalid push platform' USING ERRCODE = '22023';
  END IF;

  IF v_previous_token <> '' AND v_previous_token <> v_token THEN
    DELETE FROM public.user_push_tokens
    WHERE user_id = v_user_id
      AND expo_push_token = v_previous_token;
  END IF;

  INSERT INTO public.user_push_tokens (
    user_id,
    expo_push_token,
    platform,
    updated_at,
    last_seen_at
  )
  VALUES (
    v_user_id,
    v_token,
    v_platform,
    now(),
    now()
  )
  ON CONFLICT (expo_push_token) DO UPDATE
  SET user_id = EXCLUDED.user_id,
      platform = EXCLUDED.platform,
      updated_at = now(),
      last_seen_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.claim_my_push_token(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_my_push_token(text, text, text) TO authenticated;

commit;
