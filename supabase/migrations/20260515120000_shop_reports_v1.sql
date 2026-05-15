-- Signalements boutique (Sprint 5 — confiance marketplace, mobile).

CREATE TABLE IF NOT EXISTS public.shop_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shop_reports_reason_not_empty CHECK (char_length(trim(reason)) > 0)
);

CREATE INDEX IF NOT EXISTS shop_reports_shop_id_idx ON public.shop_reports(shop_id);
CREATE INDEX IF NOT EXISTS shop_reports_user_id_idx ON public.shop_reports(user_id);
CREATE INDEX IF NOT EXISTS shop_reports_created_at_idx ON public.shop_reports(created_at DESC);

ALTER TABLE public.shop_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS shop_reports_insert_own ON public.shop_reports;
CREATE POLICY shop_reports_insert_own ON public.shop_reports
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());
