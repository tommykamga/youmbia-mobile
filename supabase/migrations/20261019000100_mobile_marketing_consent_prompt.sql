-- Mobile Home : preuve de consentement après action explicite uniquement.
-- Ne valide jamais les préférences importées ; n'active aucun flag de campagne.
CREATE OR REPLACE FUNCTION public.lifecycle_has_verifiable_marketing_consent(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.email_preferences AS p
    WHERE p.user_id = p_user_id
      AND p.marketing_opt_in IS TRUE
      AND p.unsubscribed_at IS NULL
      AND p.marketing_opt_in_at IS NOT NULL
      AND p.marketing_opt_in_source IN ('signup', 'settings', 'mobile_home_prompt')
  );
$function$;
