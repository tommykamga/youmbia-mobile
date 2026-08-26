-- Provisioning garanti de public.profiles à la création d'un compte Auth.
-- P0 Fix 1/3 : nouveaux utilisateurs uniquement (pas de backfill).
--
-- Le trigger SECURITY DEFINER contourne RLS pour insérer la ligne
-- profiles.id = auth.users.id. ON CONFLICT DO NOTHING rend l'opération
-- idempotente (rejeu migration, race client ensureProfile).
--
-- Les policies ci-dessous sont additives : aucune policy existante n'est
-- supprimée. RLS n'est pas forcée ici pour ne pas masquer une lecture
-- publique vendeur déjà en place.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_full_name text;
  v_avatar_url text;
BEGIN
  v_full_name := NULLIF(
    TRIM(
      COALESCE(
        NEW.raw_user_meta_data ->> 'full_name',
        NEW.raw_user_meta_data ->> 'name'
      )
    ),
    ''
  );

  v_avatar_url := NULLIF(
    TRIM(
      COALESCE(
        NEW.raw_user_meta_data ->> 'avatar_url',
        NEW.raw_user_meta_data ->> 'picture'
      )
    ),
    ''
  );

  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (NEW.id, v_full_name, v_avatar_url)
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

GRANT SELECT, INSERT, UPDATE ON TABLE public.profiles TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
      AND policyname = 'profiles_select_own'
  ) THEN
    CREATE POLICY profiles_select_own
      ON public.profiles
      FOR SELECT
      TO authenticated
      USING (id = (SELECT auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
      AND policyname = 'profiles_insert_own'
  ) THEN
    CREATE POLICY profiles_insert_own
      ON public.profiles
      FOR INSERT
      TO authenticated
      WITH CHECK (id = (SELECT auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
      AND policyname = 'profiles_update_own'
  ) THEN
    CREATE POLICY profiles_update_own
      ON public.profiles
      FOR UPDATE
      TO authenticated
      USING (id = (SELECT auth.uid()))
      WITH CHECK (id = (SELECT auth.uid()));
  END IF;
END $$;
