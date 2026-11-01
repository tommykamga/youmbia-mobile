-- V5-02A / AUD-01,02,05. LOCAL ONLY: qualify on restored isolated baseline before release.
-- No backfill, ranking change, marketing/Cron change, new enum or new client RPC.
-- Existing authenticated 4.7.x INSERT/UPDATE contracts remain usable.
BEGIN;

CREATE OR REPLACE FUNCTION public.guard_listing_lifecycle_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  moderator boolean;
BEGIN
  -- Normalize BEFORE sale-cycle/renewal triggers (alphabetical trigger order).
  -- Even privileged inserts use server time; historical rows are never rewritten.
  IF TG_OP = 'INSERT' THEN
    NEW.created_at := pg_catalog.now();
  ELSE
    NEW.created_at := OLD.created_at;
  END IF;

  -- Use the actual database role, never a client-editable JWT metadata flag.
  -- is_admin() is the existing admin_users-backed authorization used by RLS.
  moderator := CURRENT_USER IN ('postgres', 'supabase_admin', 'service_role');
  IF NOT moderator THEN
    moderator := auth.uid() IS NOT NULL AND public.is_admin();
  END IF;
  IF moderator THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL OR NEW.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Annonce introuvable ou non autorisée' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'INSERT' THEN
    -- hidden supports legacy Web creation in pause. No owner-created moderation/sale.
    IF NEW.status NOT IN ('draft', 'active', 'hidden') THEN
      RAISE EXCEPTION 'Statut initial annonce interdit' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Annonce introuvable ou non autorisée' USING ERRCODE = '42501';
  END IF;
  -- Content edits and renewal retain their status, including content of suspended rows.
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;
  IF (OLD.status = 'draft' AND NEW.status = 'active')
     OR (OLD.status = 'active' AND NEW.status IN ('hidden', 'sold'))
     OR (OLD.status = 'hidden' AND NEW.status IN ('active', 'sold'))
     OR (OLD.status = 'sold' AND NEW.status = 'active') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Transition annonce interdite pour le vendeur' USING ERRCODE = '42501';
END;
$$;

REVOKE ALL ON FUNCTION public.guard_listing_lifecycle_owner() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER listings_guard_lifecycle_owner
BEFORE INSERT OR UPDATE ON public.listings
FOR EACH ROW EXECUTE FUNCTION public.guard_listing_lifecycle_owner();

-- Additive: preserve every existing public policy. Ownership is the listing owner,
-- not the image path, and applies to draft/active/hidden/sold/suspended alike.
CREATE POLICY listing_images_owner_select
ON public.listing_images FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.listings AS l
  WHERE l.id = listing_images.listing_id
    AND l.user_id = (SELECT auth.uid())
));

COMMIT;
