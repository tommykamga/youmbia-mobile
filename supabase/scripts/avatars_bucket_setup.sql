-- ============================================================================
-- YOUMBIA — Bucket Storage "avatars" + policies RLS (OPTIONNEL / MANUEL)
-- ============================================================================
-- ⚠️ NE PAS appliquer automatiquement. À exécuter dans Supabase SQL Editor
--    UNIQUEMENT si vous voulez un bucket dédié aux photos de profil.
--
-- Contexte :
--   Par défaut, l'app mobile utilise le bucket EXISTANT `listing-images`
--   (voir src/lib/avatarImageUrl.ts → AVATARS_BUCKET). La fonctionnalité
--   marche déjà sans ce script.
--
--   Pour un bucket dédié, créez le bucket `avatars` ci-dessous PUIS définissez
--   la variable d'env Expo : EXPO_PUBLIC_AVATARS_BUCKET=avatars
--
-- Convention de chemin utilisée par l'app : `{userId}/avatar.jpg`
--   → la 1re partie du chemin (storage.foldername(name)[1]) = auth.uid()
-- ============================================================================

-- 1) Création du bucket (privé : l'app lit via signed URLs).
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', false)
on conflict (id) do nothing;

-- 2) Policies RLS sur storage.objects, restreintes au dossier de l'utilisateur.

-- Lecture : l'utilisateur peut lire ses propres fichiers (signed URLs).
drop policy if exists "avatars_select_own" on storage.objects;
create policy "avatars_select_own"
on storage.objects for select
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Insertion : l'utilisateur ne peut écrire que dans son propre dossier.
drop policy if exists "avatars_insert_own" on storage.objects;
create policy "avatars_insert_own"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Mise à jour (upsert) : idem.
drop policy if exists "avatars_update_own" on storage.objects;
create policy "avatars_update_own"
on storage.objects for update
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Suppression : l'utilisateur ne peut supprimer que ses propres fichiers.
drop policy if exists "avatars_delete_own" on storage.objects;
create policy "avatars_delete_own"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- ============================================================================
-- 3) RAPPEL — RLS table public.profiles (NE PAS exécuter si déjà en place)
-- ============================================================================
-- L'update de profiles.avatar_url doit être autorisé pour la ligne de
-- l'utilisateur. Vérifiez qu'une policy de ce type existe déjà :
--
--   create policy "profiles_update_own"
--   on public.profiles for update
--   to authenticated
--   using (id = auth.uid())
--   with check (id = auth.uid());
--
-- Si l'update est bloqué par RLS, l'app affichera "Impossible de mettre à
-- jour la photo". Dans ce cas, ajoutez la policy ci-dessus (manuellement).
-- ============================================================================
