-- TOM-98 Lot A — garde-fous draft (sale cycle, saved search).
-- Dépend de 20260909110000_listing_status_draft_v1 (enum `draft` déjà commitée).
--
-- 1) Sale cycle : INSERT draft → pas de cycle ; draft→active → démarre le cycle.
-- 2) Renewal : inchangé (draft→active = « autre UPDATE », pas de boost renewed_at).
-- 3) Saved Search TOM-97 + exception TOM-98 :
--    - INSERT active            → matching (trigger existant TOM-97)
--    - INSERT draft             → aucun matching (WHEN NEW.status = 'active')
--    - UPDATE draft→active      → matching une fois (exception 1re publication)
--    - UPDATE draft→draft       → aucun
--    - UPDATE active→active     → aucun (renewal / édition)
--    - UPDATE hidden→active     → aucun
--    - UPDATE sold→active       → aucun
--    Ledger UNIQUE (saved_search_id, listing_id) empêche tout double push.
-- 4) RLS : AUCUNE policy draft. Prod a déjà owner CRUD + SELECT public = active.
--    Ne pas ENABLE/DISABLE RLS. Ne pas élargir le SELECT public.
--
-- VALIDATION REQUISE AVANT APPLICATION EN PRODUCTION
-- Ne pas appliquer sans GO. Appliquer après 20260909110000 (transactions séparées).

-- ---------------------------------------------------------------------------
-- 1) Sale cycle : draft sans cycle ; draft→active démarre le cycle
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_listings_sale_cycle()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.sold_at := CASE WHEN NEW.status = 'sold' THEN now() ELSE NULL END;
    IF NEW.status = 'draft' THEN
      NEW.sale_cycle_started_at := NULL;
    ELSE
      NEW.sale_cycle_started_at := COALESCE(NEW.created_at, now());
    END IF;
    RETURN NEW;
  END IF;

  NEW.sold_at := OLD.sold_at;
  NEW.sale_cycle_started_at := OLD.sale_cycle_started_at;

  IF NEW.status = 'sold' AND OLD.status IS DISTINCT FROM 'sold' THEN
    NEW.sold_at := now();
  ELSIF OLD.status = 'sold' AND NEW.status IN ('active', 'hidden') THEN
    NEW.sold_at := NULL;
    NEW.sale_cycle_started_at := now();
  ELSIF OLD.status = 'sold' AND NEW.status = 'suspended' THEN
    NEW.sold_at := NULL;
  ELSIF OLD.status = 'draft' AND NEW.status = 'active' THEN
    NEW.sold_at := NULL;
    NEW.sale_cycle_started_at := now();
  END IF;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2) Saved Search — exception TOM-98 : 1re publication draft→active uniquement
--    WHEN strict : jamais hidden/sold/active→active, jamais draft→draft.
--    Fonction partagée + ledger UNIQUE = pas de double alerte.
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_listings_match_saved_searches_publish_draft ON public.listings;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'listings_match_saved_searches'
  ) THEN
    EXECUTE $trg$
      CREATE TRIGGER trg_listings_match_saved_searches_publish_draft
        AFTER UPDATE OF status ON public.listings
        FOR EACH ROW
        WHEN (OLD.status = 'draft' AND NEW.status = 'active')
        EXECUTE FUNCTION public.listings_match_saved_searches()
    $trg$;
  END IF;
END;
$$;
