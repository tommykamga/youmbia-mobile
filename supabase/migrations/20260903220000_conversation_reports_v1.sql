-- Trust V1 — signalement conversation (TOM-102).
-- Réutilise listing_reports / user_reports existants. Nouvelle table uniquement
-- pour les conversations (aucune table compatible n'existait).
-- INSERT authentifié uniquement. Pas de SELECT/UPDATE/DELETE client.
-- Aucun corps de message n'est stocké.

CREATE TABLE IF NOT EXISTS public.conversation_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text NOT NULL,
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conversation_reports_reason_not_empty CHECK (char_length(trim(reason)) > 0),
  CONSTRAINT conversation_reports_comment_max_len CHECK (
    comment IS NULL OR char_length(comment) <= 500
  ),
  CONSTRAINT conversation_reports_user_conversation_unique UNIQUE (user_id, conversation_id)
);

CREATE INDEX IF NOT EXISTS conversation_reports_conversation_id_idx
  ON public.conversation_reports (conversation_id);
CREATE INDEX IF NOT EXISTS conversation_reports_user_id_idx
  ON public.conversation_reports (user_id);
CREATE INDEX IF NOT EXISTS conversation_reports_created_at_idx
  ON public.conversation_reports (created_at DESC);

ALTER TABLE public.conversation_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS conversation_reports_insert_own ON public.conversation_reports;
CREATE POLICY conversation_reports_insert_own ON public.conversation_reports
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.conversations c
      WHERE c.id = conversation_reports.conversation_id
        AND (
          c.buyer_id = (SELECT auth.uid())
          OR c.seller_id = (SELECT auth.uid())
        )
    )
  );

DROP POLICY IF EXISTS conversation_reports_select_own ON public.conversation_reports;
CREATE POLICY conversation_reports_select_own ON public.conversation_reports
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

REVOKE ALL ON TABLE public.conversation_reports FROM PUBLIC;
REVOKE ALL ON TABLE public.conversation_reports FROM anon;
GRANT INSERT, SELECT ON TABLE public.conversation_reports TO authenticated;

-- Cleanup compte : mêmes gardes to_regclass que delete_account_v1.
CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  uid uuid := auth.uid();
  has_listings boolean := to_regclass('public.listings') IS NOT NULL;
  has_shops    boolean := to_regclass('public.shops') IS NOT NULL;
  has_profiles boolean := to_regclass('public.profiles') IS NOT NULL;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Non authentifié' USING ERRCODE = '28000';
  END IF;

  IF to_regclass('public.messages') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.messages WHERE sender_id = $1' USING uid;
  END IF;
  IF to_regclass('public.conversation_reports') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.conversation_reports WHERE user_id = $1' USING uid;
  END IF;
  IF to_regclass('public.conversations') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.conversations WHERE buyer_id = $1 OR seller_id = $1' USING uid;
  END IF;
  IF to_regclass('public.favorites') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.favorites WHERE user_id = $1' USING uid;
  END IF;
  IF to_regclass('public.listing_reports') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.listing_reports WHERE user_id = $1' USING uid;
  END IF;
  IF to_regclass('public.shop_reports') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.shop_reports WHERE user_id = $1' USING uid;
  END IF;
  IF to_regclass('public.user_reports') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.user_reports WHERE reporter_user_id = $1 OR reported_user_id = $1' USING uid;
  END IF;
  IF to_regclass('public.reports') IS NOT NULL THEN
    EXECUTE 'UPDATE public.reports SET reporter_user_id = NULL WHERE reporter_user_id = $1' USING uid;
  END IF;

  IF has_listings THEN
    IF to_regclass('public.conversations') IS NOT NULL THEN
      IF to_regclass('public.messages') IS NOT NULL THEN
        EXECUTE '
          DELETE FROM public.messages WHERE conversation_id IN (
            SELECT c.id FROM public.conversations c
            JOIN public.listings l ON l.id = c.listing_id
            WHERE l.user_id = $1
          )' USING uid;
      END IF;
      EXECUTE '
        DELETE FROM public.conversations WHERE listing_id IN (
          SELECT id FROM public.listings WHERE user_id = $1
        )' USING uid;
    END IF;
    IF to_regclass('public.favorites') IS NOT NULL THEN
      EXECUTE '
        DELETE FROM public.favorites WHERE listing_id IN (
          SELECT id FROM public.listings WHERE user_id = $1
        )' USING uid;
    END IF;
    IF to_regclass('public.reports') IS NOT NULL THEN
      EXECUTE '
        DELETE FROM public.reports WHERE listing_id IN (
          SELECT id FROM public.listings WHERE user_id = $1
        )' USING uid;
    END IF;
    IF to_regclass('public.listing_reports') IS NOT NULL THEN
      EXECUTE '
        DELETE FROM public.listing_reports WHERE listing_id IN (
          SELECT id FROM public.listings WHERE user_id = $1
        )' USING uid;
    END IF;
    IF to_regclass('public.listing_promotions') IS NOT NULL THEN
      EXECUTE '
        DELETE FROM public.listing_promotions WHERE listing_id IN (
          SELECT id FROM public.listings WHERE user_id = $1
        )' USING uid;
    END IF;
    IF to_regclass('public.listing_images') IS NOT NULL THEN
      EXECUTE '
        DELETE FROM public.listing_images WHERE listing_id IN (
          SELECT id FROM public.listings WHERE user_id = $1
        )' USING uid;
    END IF;

    EXECUTE 'DELETE FROM public.listings WHERE user_id = $1' USING uid;
  END IF;

  IF has_shops THEN
    IF has_profiles THEN
      EXECUTE '
        UPDATE public.profiles SET shop_id = NULL
        WHERE shop_id IN (SELECT id FROM public.shops WHERE owner_id = $1)' USING uid;
    END IF;
    IF has_listings THEN
      EXECUTE '
        UPDATE public.listings SET shop_id = NULL
        WHERE shop_id IN (SELECT id FROM public.shops WHERE owner_id = $1)' USING uid;
    END IF;
    IF to_regclass('public.shop_reports') IS NOT NULL THEN
      EXECUTE '
        DELETE FROM public.shop_reports
        WHERE shop_id IN (SELECT id FROM public.shops WHERE owner_id = $1)' USING uid;
    END IF;
    EXECUTE 'DELETE FROM public.shops WHERE owner_id = $1' USING uid;
  END IF;

  IF has_profiles THEN
    EXECUTE 'DELETE FROM public.profiles WHERE id = $1' USING uid;
  END IF;

  EXECUTE 'DELETE FROM auth.users WHERE id = $1' USING uid;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_my_account() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_my_account() FROM anon;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;
