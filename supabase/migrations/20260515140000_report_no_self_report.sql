-- Sprint 5 — empêcher l’auto-signalement (renforcement DB, idempotent).

-- shop_reports : renforcer la policy d’insert créée en v1
DROP POLICY IF EXISTS shop_reports_insert_own ON public.shop_reports;
CREATE POLICY shop_reports_insert_own ON public.shop_reports
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND NOT EXISTS (
      SELECT 1
      FROM public.shops s
      WHERE s.id = shop_reports.shop_id
        AND s.owner_id = auth.uid()
    )
  );

-- listing_reports : policy restrictive (ne remplace pas les policies permissives existantes)
DO $$
BEGIN
  IF to_regclass('public.listing_reports') IS NOT NULL THEN
    ALTER TABLE public.listing_reports ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS listing_reports_no_self_report ON public.listing_reports;
    CREATE POLICY listing_reports_no_self_report ON public.listing_reports
      AS RESTRICTIVE
      FOR INSERT
      TO authenticated
      WITH CHECK (
        NOT EXISTS (
          SELECT 1
          FROM public.listings l
          WHERE l.id = listing_reports.listing_id
            AND l.user_id = auth.uid()
        )
      );
  END IF;
END $$;
