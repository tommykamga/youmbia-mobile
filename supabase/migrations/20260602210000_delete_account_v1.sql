-- Suppression de compte conforme Apple (App Store Review Guideline 5.1.1(v)) et RGPD.
--
-- Fonction RPC appelable par l'utilisateur authentifié pour supprimer SON propre
-- compte et toutes ses données personnelles, en une seule transaction.
-- SECURITY DEFINER : exécutée avec les privilèges du propriétaire (postgres),
-- nécessaires pour supprimer la ligne dans auth.users.
--
-- ROBUSTESSE SCHÉMA : chaque DELETE/UPDATE est conditionné par l'existence réelle
-- de la table en production (to_regclass + SQL dynamique). Une table absente est
-- simplement ignorée — la fonction ne plante donc pas avec "relation does not
-- exist" (SQLSTATE 42P01) si le schéma diffère de celui attendu.

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

  -- 1) Données sociales / personnelles créées par l'utilisateur.
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

  -- 2) Dépendances des annonces de l'utilisateur (y compris données d'autres
  --    utilisateurs qui pointent vers ces annonces : favoris, conversations…).
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

    -- 3) Annonces de l'utilisateur.
    EXECUTE 'DELETE FROM public.listings WHERE user_id = $1' USING uid;
  END IF;

  -- 4) Boutique de l'utilisateur : on neutralise d'abord les références.
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

  -- 5) Profil public.
  IF has_profiles THEN
    EXECUTE 'DELETE FROM public.profiles WHERE id = $1' USING uid;
  END IF;

  -- 6) Compte d'authentification (suppression définitive — RGPD).
  EXECUTE 'DELETE FROM auth.users WHERE id = $1' USING uid;
END;
$$;

-- Seuls les utilisateurs authentifiés peuvent appeler la fonction (sur leur
-- propre compte, garanti par auth.uid()). On retire tout accès anonyme/public.
REVOKE ALL ON FUNCTION public.delete_my_account() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_my_account() FROM anon;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;
