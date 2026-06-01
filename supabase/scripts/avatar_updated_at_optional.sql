-- ============================================================================
-- YOUMBIA — Colonne optionnelle profiles.avatar_updated_at (MANUEL / OPTIONNEL)
-- ============================================================================
-- ⚠️ NE PAS appliquer automatiquement. À exécuter dans le SQL Editor Supabase
--    UNIQUEMENT si vous souhaitez un marqueur de version dédié à l'avatar.
--
-- État actuel (sans ce script) :
--   La table `profiles` n'a PAS de colonne timestamp exploitable (pas de
--   updated_at). La synchro multi-appareils + le cache-busting fonctionnent
--   DÉJÀ car l'app uploade chaque avatar sous un nom de fichier UNIQUE
--   (`{userId}/avatar_<timestamp>.jpg`) : la valeur `avatar_url` change donc à
--   chaque remplacement et se propage à tous les appareils via la DB.
--   Aucune migration n'est requise.
--
-- Intérêt de avatar_updated_at :
--   Marqueur de version explicite/lisible (analytics, web, audit). Non requis
--   par le mobile. getAvatarVersion() le prendra en compte s'il existe.
--
-- Après application :
--   Pour que le mobile lise la colonne, l'ajouter au SELECT de
--   getCurrentProfile()/updateProfile() (src/services/profile/profile.ts).
-- ============================================================================

-- 1) Colonne (nullable).
alter table public.profiles
  add column if not exists avatar_updated_at timestamptz;

-- 2) Trigger : met à jour avatar_updated_at uniquement quand avatar_url change.
create or replace function public.set_avatar_updated_at()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.avatar_url is not null then
      new.avatar_updated_at := now();
    end if;
  elsif new.avatar_url is distinct from old.avatar_url then
    new.avatar_updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_avatar_updated_at on public.profiles;
create trigger trg_set_avatar_updated_at
  before insert or update of avatar_url on public.profiles
  for each row
  execute function public.set_avatar_updated_at();

-- 3) Backfill initial pour les lignes ayant déjà un avatar.
update public.profiles
set avatar_updated_at = coalesce(avatar_updated_at, now())
where avatar_url is not null and avatar_updated_at is null;
