-- Données de test Espace Vendeur Pro (Supabase SQL Editor).
-- ⚠️ Remplacez l’email ci-dessous par le compte de test, puis exécutez tout le script.

-- ========== SEED ==========

WITH target AS (
  SELECT id AS owner_id
  FROM public.profiles
  WHERE id = (
    SELECT id FROM auth.users WHERE email = 'tom@yopmail.com' LIMIT 1
  )
  LIMIT 1
),
upsert_shop AS (
  INSERT INTO public.shops (
    owner_id,
    name,
    slug,
    description,
    city,
    whatsapp_phone,
    phone,
    is_verified,
    is_featured
  )
  SELECT
    target.owner_id,
    'Boutique Test YOUMBIA',
    'boutique-test-youmbia',
    'Boutique professionnelle de démonstration.',
    'Douala',
    NULL,
    NULL,
    true,
    true
  FROM target
  ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    city = EXCLUDED.city,
    is_verified = EXCLUDED.is_verified,
    is_featured = EXCLUDED.is_featured,
    updated_at = now()
  RETURNING id, owner_id
)
UPDATE public.profiles p
SET
  seller_type = 'pro',
  shop_id = upsert_shop.id
FROM upsert_shop
WHERE p.id = upsert_shop.owner_id;

UPDATE public.listings l
SET shop_id = p.shop_id
FROM public.profiles p
WHERE l.user_id = p.id
  AND p.shop_id IS NOT NULL
  AND l.status = 'active'
  AND l.id IN (
    SELECT l2.id
    FROM public.listings l2
    WHERE l2.user_id = p.id AND l2.status = 'active'
    ORDER BY l2.created_at DESC
    LIMIT 5
  );

-- Vérification :
-- SELECT p.id, p.seller_type, p.shop_id, s.slug FROM public.profiles p
-- LEFT JOIN public.shops s ON s.id = p.shop_id
-- WHERE p.id = (SELECT id FROM auth.users WHERE email = 'tom@yopmail.com' LIMIT 1);

-- ========== ROLLBACK (décommenter + même email) ==========
-- UPDATE public.listings SET shop_id = NULL
-- WHERE shop_id IN (
--   SELECT shop_id FROM public.profiles
--   WHERE id = (SELECT id FROM auth.users WHERE email = 'tom@yopmail.com' LIMIT 1)
--     AND shop_id IS NOT NULL
-- );
-- UPDATE public.profiles
-- SET seller_type = 'individual', shop_id = NULL
-- WHERE id = (SELECT id FROM auth.users WHERE email = 'tom@yopmail.com' LIMIT 1);
-- DELETE FROM public.shops WHERE slug = 'boutique-test-youmbia';
