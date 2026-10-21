-- TOM-104 SECURITY — restreindre la visibilité API des boutiques masquées.
-- Ancien comportement: shops_select_public USING (true), y compris hidden/suspended.
-- Nouveau comportement: visiteurs et autres membres = active seulement.
-- Propriétaire: shops_select_owner FOR SELECT USING (owner_id = auth.uid()) reste inchangée.
-- Aucun changement de données, privilèges ou statut; ne pas exécuter avant gate migration.
--
-- Préconditions strictes : STOP si les politiques ont dérivé depuis l'audit 21/10/2026.
DO $check$
DECLARE
  v_public_qual text;
BEGIN
  IF NOT (SELECT c.relrowsecurity FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND c.relname = 'shops') THEN
    RAISE EXCEPTION 'TOM-104: RLS shops absente ou désactivée';
  END IF;

  SELECT qual INTO v_public_qual
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'shops'
    AND policyname = 'shops_select_public'
    AND cmd = 'SELECT' AND roles = ARRAY['public']::name[];

  IF v_public_qual IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'TOM-104: shops_select_public modifiée; revue requise (policy drift)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'shops'
      AND policyname = 'shops_select_owner' AND cmd = 'SELECT'
      AND roles = ARRAY['authenticated']::name[]
      AND qual = '(owner_id = auth.uid())'
  ) THEN
    RAISE EXCEPTION 'TOM-104: shops_select_owner absente ou modifiée; STOP';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'shops'
      AND cmd IN ('SELECT', 'ALL')
      AND policyname NOT IN ('shops_select_public', 'shops_select_owner')
  ) THEN
    RAISE EXCEPTION 'TOM-104: politique de lecture supplémentaire; STOP';
  END IF;
END;
$check$;

-- Le SELECT propriétaire continue via la politique shops_select_owner (permissive OR).
ALTER POLICY shops_select_public ON public.shops
USING (status = 'active');

-- Assertion postcondition : une visibilité anonyme ne dépend plus de USING (true).
DO $verify$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'shops'
      AND policyname = 'shops_select_public'
      AND cmd = 'SELECT'
      AND qual = '(status = ''active''::text)'
  ) THEN
    RAISE EXCEPTION 'TOM-104: assertion post-migration policy FAILED';
  END IF;
END;
$verify$;
