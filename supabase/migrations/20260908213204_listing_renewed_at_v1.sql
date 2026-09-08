-- TOM-99 Lot C — renewal / remise en ligne (backward-compatible, additif).
--
-- PREUVE DU BESOIN
-- Home / Search / Similar / seller listings trient la « récence » sur created_at
-- (jamais updated_at). updated_at est muté par édition et bump : ce n’est PAS
-- une date de publication. created_at est la vraie mise en ligne initiale.
-- sold_at / sale_cycle_started_at mesurent le cycle de vente (Lot B), pas le ranking.
-- Après sold → active, l’annonce redevient visible mais resterait enterrée par created_at.
-- Un renouvellement d’annonce active ancienne a le même besoin, sans recréer la ligne.
-- Le propriétaire a UPDATE RLS : sans cooldown DB, un UPDATE direct de renewed_at
-- permettrait de renouveler en boucle (le clamp à now() suffisait à booster le ranking).
--
-- STRATÉGIE
-- renewed_at timestamptz NULL : source de vérité, aucun backfill.
-- last_published_at généré = COALESCE(renewed_at, created_at) : clé de tri discovery.
-- Trigger BEFORE INSERT OR UPDATE sur TOUTE la ligne (aucune restriction de colonnes) :
--   intercepte aussi un UPDATE direct de renewed_at.
-- La fonction ne fait que RETURN NEW ou RAISE (pas d’UPDATE listings) : pas de récursion
-- avec trg_listings_set_updated_at ni listings_set_sale_cycle.
-- Colonnes distinctes :
--   listings_set_renewed_at     → renewed_at
--   listings_set_sale_cycle      → sold_at, sale_cycle_started_at
--   trg_listings_set_updated_at → updated_at (prod)
-- RAISE abortit tout l’UPDATE : aucun des trois ne persiste.
--
-- RÈGLES (alignées sur src/lib/listingRenewal.ts)
-- INSERT : renewed_at = NULL (legacy et nouvelles : COALESCE vers created_at)
-- UPDATE — toujours restaurer OLD.renewed_at d’abord
--   last_publication = COALESCE(OLD.renewed_at, OLD.created_at)
--   sold -> active : toujours PASS (réactivation)
--     si now() >= last_publication + 3 days : renewed_at = now() (boost ranking)
--     sinon renewed_at = OLD (pas d’erreur, pas de boost)
--   hidden -> active : renewed_at inchangé (reprise, pas un renewal)
--   active -> active + NEW.renewed_at IS DISTINCT FROM OLD.renewed_at :
--     si now() < last_publication + interval '3 days' : RAISE EXCEPTION
--     sinon renewed_at = now()  (timestamp client ignoré)
--   autre UPDATE : renewed_at = OLD (falsification title/price/dates neutralisée)
--   suspended + tentative renewed_at : RAISE EXCEPTION
-- created_at / updated_at / sold_at / sale_cycle_started_at : non modifiés ici
--
-- VALIDATION REQUISE AVANT APPLICATION EN PRODUCTION
-- Ne pas appliquer cette migration sans validation (kill-criterion TOM-99).

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS renewed_at timestamptz NULL;

COMMENT ON COLUMN public.listings.renewed_at IS
  'Dernier renouvellement / remise en ligne (sold→active ou renouvellement manuel). NULL si jamais renouvelée. Jamais backfillé. Distinct de sold_at et sale_cycle_started_at. Cooldown 3 jours enforced en trigger.';

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS last_published_at timestamptz
  GENERATED ALWAYS AS (COALESCE(renewed_at, created_at)) STORED;

COMMENT ON COLUMN public.listings.last_published_at IS
  'Clé de tri discovery = COALESCE(renewed_at, created_at). Colonne générée, non inscriptible. Pas un backfill de renewed_at.';

CREATE INDEX IF NOT EXISTS listings_active_last_published_at_idx
  ON public.listings (last_published_at DESC NULLS LAST)
  WHERE status = 'active';

CREATE OR REPLACE FUNCTION public.set_listings_renewed_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  requested_renew boolean;
  last_publication timestamptz;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.renewed_at := NULL;
    RETURN NEW;
  END IF;

  requested_renew := NEW.renewed_at IS DISTINCT FROM OLD.renewed_at;
  NEW.renewed_at := OLD.renewed_at;
  last_publication := COALESCE(OLD.renewed_at, OLD.created_at);

  IF OLD.status = 'sold' AND NEW.status = 'active' THEN
    IF last_publication IS NOT NULL AND now() >= last_publication + interval '3 days' THEN
      NEW.renewed_at := now();
    END IF;
  ELSIF OLD.status = 'active' AND NEW.status = 'active' AND requested_renew THEN
    IF last_publication IS NOT NULL AND now() < last_publication + interval '3 days' THEN
      RAISE EXCEPTION 'Cette annonce ne peut être renouvelée que toutes les 3 jours.';
    END IF;
    NEW.renewed_at := now();
  ELSIF OLD.status = 'suspended' AND requested_renew THEN
    RAISE EXCEPTION 'Une annonce suspendue ne peut pas être renouvelée.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS listings_set_renewed_at
ON public.listings;

CREATE TRIGGER listings_set_renewed_at
BEFORE INSERT OR UPDATE
ON public.listings
FOR EACH ROW
EXECUTE FUNCTION public.set_listings_renewed_at();
