-- ============================================================================
-- YOUMBIA — Lecture cross-user des avatars (Storage)
-- ============================================================================
-- ⚠️ Script MANUEL — requis pour afficher la photo d'un AUTRE utilisateur
--    (messagerie, fiche vendeur, annonces) via signed URLs.
--
-- Sans cette policy, seul le propriétaire peut lire son dossier `{userId}/avatar_*`.
-- Les signed URLs générées pour un autre utilisateur échoueront silencieusement
-- → l'apparently affiche l'initiale (fallback).
-- ============================================================================

-- Bucket dédié `avatars` (si EXPO_PUBLIC_AVATARS_BUCKET=avatars)
drop policy if exists "avatars_select_authenticated_read" on storage.objects;
create policy "avatars_select_authenticated_read"
on storage.objects for select
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
  and name ~ '/avatar_'
);

-- Fallback bucket `listing-images` (défaut mobile actuel)
drop policy if exists "listing_images_avatar_select_authenticated" on storage.objects;
create policy "listing_images_avatar_select_authenticated"
on storage.objects for select
to authenticated
using (
  bucket_id = 'listing-images'
  and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
  and name ~ '/avatar_'
);
