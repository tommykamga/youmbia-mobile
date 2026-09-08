-- TOM-99 Lot B — time-to-sale : cycle de vente courant (backward-compatible, additif).
--
-- PREUVE DU BESOIN
-- Aucun historique de statut, aucun `published_at`. `created_at` est la mise en ligne
-- réelle (insert immédiat en `active`, brouillons uniquement en mémoire).
-- `updated_at` est muté par édition et bump : ce n’est PAS une date de vente.
-- Mixpanel `listing_marked_sold` n’est pas une source de vérité.
-- `sold_at - created_at` est faux après réactivation : le 2e cycle partirait de J1.
--
-- STRATÉGIE
-- Colonnes nullables, aucun backfill (legacy : COALESCE(sale_cycle_started_at, created_at)).
-- Trigger BEFORE INSERT OR UPDATE sur TOUTE la ligne (aucune restriction de colonnes) :
--   intercepte aussi un UPDATE direct de sold_at / sale_cycle_started_at.
-- La fonction ne fait que RETURN NEW (pas d’UPDATE listings) : pas de récursion
-- avec trg_listings_set_updated_at (prod). Les deux mutent des colonnes distinctes.
--
-- RÈGLES (alignées sur src/lib/listingSaleCycle.ts)
-- INSERT :
--   sold_at = now() si status = sold, sinon NULL
--   sale_cycle_started_at = COALESCE(created_at, now())
-- UPDATE — toujours restaurer OLD.sold_at / OLD.sale_cycle_started_at d’abord
--   * -> sold (depuis un statut ≠ sold) : sold_at = now() ; cycle inchangé
--   sold -> active | hidden : sold_at = NULL ; sale_cycle_started_at = now()
--   sold -> suspended : sold_at = NULL ; cycle inchangé
--   hidden -> active : cycle inchangé
--   update sans changement de status : timestamps OLD (falsification neutralisée)
-- created_at / updated_at : non modifiés par cette fonction
--
-- VALIDATION REQUISE AVANT APPLICATION EN PRODUCTION
-- Ne pas appliquer cette migration sans validation (kill-criterion TOM-99).

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS sold_at timestamptz NULL;

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS sale_cycle_started_at timestamptz NULL;

COMMENT ON COLUMN public.listings.sold_at IS
  'Instant du cycle de vente courant (transition vers sold). NULL si jamais vendue ou réactivée. Jamais backfillé.';

COMMENT ON COLUMN public.listings.sale_cycle_started_at IS
  'Début du cycle de vente courant. NULL en legacy (alors COALESCE vers created_at). Jamais backfillé.';

CREATE OR REPLACE FUNCTION public.set_listings_sale_cycle()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.sold_at := CASE WHEN NEW.status = 'sold' THEN now() ELSE NULL END;
    NEW.sale_cycle_started_at := COALESCE(NEW.created_at, now());
    RETURN NEW;
  END IF;

  -- Neutralise toute falsification client (UPDATE direct des timestamps).
  NEW.sold_at := OLD.sold_at;
  NEW.sale_cycle_started_at := OLD.sale_cycle_started_at;

  IF NEW.status = 'sold' AND OLD.status IS DISTINCT FROM 'sold' THEN
    NEW.sold_at := now();
  ELSIF OLD.status = 'sold' AND NEW.status IN ('active', 'hidden') THEN
    NEW.sold_at := NULL;
    NEW.sale_cycle_started_at := now();
  ELSIF OLD.status = 'sold' AND NEW.status = 'suspended' THEN
    NEW.sold_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS listings_set_sold_at ON public.listings;

DROP TRIGGER IF EXISTS listings_set_sale_cycle
ON public.listings;

CREATE TRIGGER listings_set_sale_cycle
BEFORE INSERT OR UPDATE
ON public.listings
FOR EACH ROW
EXECUTE FUNCTION public.set_listings_sale_cycle();
