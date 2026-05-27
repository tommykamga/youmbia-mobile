-- Shops status V1 — visibilité/suspension (backward-compatible).
-- Objectif: ajouter `shops.status` (active|hidden|suspended) + garde-fous côté DB.

-- 1) Colonne + backfill
ALTER TABLE public.shops
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

-- Backfill safe (si la colonne existait mais contenait des NULL suite à un import)
UPDATE public.shops
SET status = 'active'
WHERE status IS NULL;

-- 2) CHECK constraint (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'shops_status_check'
  ) THEN
    ALTER TABLE public.shops
      ADD CONSTRAINT shops_status_check
      CHECK (status IN ('active', 'hidden', 'suspended'));
  END IF;
END $$;

-- 3) Indexes
CREATE INDEX IF NOT EXISTS shops_status_idx
  ON public.shops (status);

CREATE INDEX IF NOT EXISTS shops_status_featured_idx
  ON public.shops (status, is_featured, updated_at);

-- 4) Garde-fous update status (owner ne peut pas toucher `suspended`)
CREATE OR REPLACE FUNCTION public.enforce_shop_status_rules()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Si suspension en cours, seul admin/service role peut modifier le status.
  IF (OLD.status = 'suspended' AND NEW.status IS DISTINCT FROM OLD.status) THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'Modification de statut impossible: boutique suspendue'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Interdire à un owner de passer vers suspended.
  IF (NEW.status = 'suspended' AND NEW.status IS DISTINCT FROM OLD.status) THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'Modification de statut impossible: suspension réservée admin'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS shops_enforce_status_rules ON public.shops;
CREATE TRIGGER shops_enforce_status_rules
  BEFORE UPDATE ON public.shops
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_shop_status_rules();

