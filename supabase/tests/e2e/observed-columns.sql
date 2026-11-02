-- Test baseline complement, schema metadata read-only observed 2026-10-23.
-- Not a production migration and not an invented replacement for marketplace tables.
-- profiles public metadata includes these nullable columns absent from the older Web schema.sql.
alter table public.profiles add column if not exists avatar_url text,
 add column if not exists bio text, add column if not exists shop_slug text,
 add column if not exists avatar_updated_at timestamptz;
-- Listing presentation metadata is present in the read-only production catalog but is
-- absent from the pinned Web snapshot and both checked-in migration chains.
alter table public.listings add column if not exists boosted boolean default false,
 add column if not exists urgent boolean default false,
 add column if not exists district text;
-- Parent/level are defined by the versioned taxonomy migration. Align observed type.
alter table public.categories alter column level type integer;
