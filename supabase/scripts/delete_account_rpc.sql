-- À exécuter dans le SQL Editor Supabase (ou via la migration équivalente
-- supabase/migrations/20260602210000_delete_account_v1.sql).
--
-- Crée la RPC public.delete_my_account() : suppression complète et RGPD du
-- compte de l'utilisateur authentifié, puis de auth.users.
-- Conforme à l'App Store Review Guideline 5.1.1(v).
--
-- Chaque DELETE/UPDATE est conditionné par l'existence réelle de la table
-- (to_regclass + SQL dynamique) : une table absente en production est ignorée,
-- évitant l'erreur "relation does not exist" (SQLSTATE 42P01).

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
