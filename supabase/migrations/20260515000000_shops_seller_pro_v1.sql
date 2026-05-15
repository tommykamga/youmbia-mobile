-- Espace Vendeur Pro V1 — boutiques optionnelles (backward-compatible).

CREATE TABLE IF NOT EXISTS public.shops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  logo_url text,
  banner_url text,
  whatsapp_phone text,
  phone text,
  city text,
  is_verified boolean NOT NULL DEFAULT false,
  is_featured boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shops_name_not_empty CHECK (char_length(trim(name)) > 0),
  CONSTRAINT shops_slug_not_empty CHECK (char_length(trim(slug)) > 0)
);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS seller_type text NOT NULL DEFAULT 'individual',
  ADD COLUMN IF NOT EXISTS shop_id uuid REFERENCES public.shops(id) ON DELETE SET NULL;

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS shop_id uuid REFERENCES public.shops(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_seller_type_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_seller_type_check
      CHECK (seller_type IN ('individual', 'pro'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS shops_owner_id_idx ON public.shops(owner_id);
CREATE INDEX IF NOT EXISTS shops_slug_idx ON public.shops(slug);
CREATE INDEX IF NOT EXISTS listings_shop_id_idx ON public.listings(shop_id);
CREATE INDEX IF NOT EXISTS profiles_shop_id_idx ON public.profiles(shop_id);

CREATE OR REPLACE FUNCTION public.set_shops_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS shops_set_updated_at ON public.shops;
CREATE TRIGGER shops_set_updated_at
  BEFORE UPDATE ON public.shops
  FOR EACH ROW
  EXECUTE FUNCTION public.set_shops_updated_at();

ALTER TABLE public.shops ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS shops_select_public ON public.shops;
CREATE POLICY shops_select_public ON public.shops
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS shops_select_owner ON public.shops;
CREATE POLICY shops_select_owner ON public.shops
  FOR SELECT
  TO authenticated
  USING (owner_id = auth.uid());

DROP POLICY IF EXISTS shops_insert_owner ON public.shops;
CREATE POLICY shops_insert_owner ON public.shops
  FOR INSERT
  TO authenticated
  WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS shops_update_owner ON public.shops;
CREATE POLICY shops_update_owner ON public.shops
  FOR UPDATE
  TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());
