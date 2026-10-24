-- Test baseline only: table ACL metadata observed read-only on 2026-10-23.
-- The historical Web DDL omits these legacy Supabase default grants.
-- Apply BEFORE the mobile migrations, whose security delta revokes excess rights.
grant all on public.profiles,public.categories,public.listings,public.listing_images,
 public.reports,public.admin_users,public.favorites,public.conversations,public.messages to anon,authenticated,service_role;
grant usage,select on all sequences in schema public to anon,authenticated,service_role;
-- The hosted project has these legacy default EXECUTE grants, which are not
-- implied by a plain Supabase local reset. Match existing functions now and
-- future public functions created by the sourced/mobile migrations.
grant execute on all functions in schema public to anon,authenticated,service_role;
alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;
