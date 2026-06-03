-- Politique de version mobile YOUMBIA (Supabase SQL Editor).
-- Test optionnel : latest = version app + patch, min = version app courante (app.json).
-- ⚠️ TODO : remplacer l’URL App Store iOS par l’ID réel une fois publié.

UPDATE public.app_versions
SET is_active = false, updated_at = now()
WHERE platform IN ('ios', 'android') AND is_active = true;

INSERT INTO public.app_versions (
  platform,
  latest_version,
  min_supported_version,
  store_url,
  message,
  is_active
) VALUES
(
  'ios',
  '4.4.1',
  '4.4.0',
  -- TODO: remplacer par l’URL App Store définitive (ex. https://apps.apple.com/app/idXXXXXXXX)
  'https://apps.apple.com/app/idVOTRE_APP_IOS',
  NULL,
  true
),
(
  'android',
  '4.4.1',
  '4.4.0',
  'https://play.google.com/store/apps/details?id=com.youmbia.mobile',
  NULL,
  true
);
