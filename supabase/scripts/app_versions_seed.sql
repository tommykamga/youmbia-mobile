-- Politique de version mobile YOUMBIA (Supabase SQL Editor).
-- Bloque les apps < 4.0.0. Propose une MAJ si installée < latest_version.
-- ⚠️ Remplacez l’URL App Store iOS si besoin, puis exécutez tout le script.

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
  '4.2.0',
  '4.0.0',
  'https://apps.apple.com/app/idVOTRE_APP_IOS',
  NULL,
  true
),
(
  'android',
  '4.2.0',
  '4.0.0',
  'https://play.google.com/store/apps/details?id=com.youmbia.mobile',
  NULL,
  true
);
