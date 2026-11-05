-- Disposable PostgreSQL ONLY. Observed contracts, not the complete Supabase history.
do $$begin
 if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
 if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
 if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role bypassrls; end if;
end$$;
-- Mirror observed Supabase default grants, including explicit function grants
-- that survive REVOKE ... FROM PUBLIC in historical migrations.
alter default privileges grant execute on functions to anon,authenticated,service_role;
alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
create schema auth;
create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create table auth.users(id uuid primary key, email text, raw_app_meta_data jsonb default '{}', raw_user_meta_data jsonb default '{}');
create table public.listings(id uuid primary key,user_id uuid references auth.users(id),status text,title text,description text,price numeric,city text);
create table public.conversations(
 id uuid primary key default gen_random_uuid(),listing_id uuid not null references public.listings(id) on delete cascade,
 buyer_id uuid not null references auth.users(id) on delete cascade,seller_id uuid not null references auth.users(id) on delete cascade,
 last_message_at timestamptz,last_message_preview text,buyer_unread_count integer not null default 0,
 seller_unread_count integer not null default 0,created_at timestamptz not null default now(),
 buyer_deleted_at timestamptz,seller_deleted_at timestamptz,
 unique(listing_id,buyer_id,seller_id));
create table public.messages(id uuid primary key default gen_random_uuid(),conversation_id uuid not null references public.conversations(id) on delete cascade,
 sender_id uuid not null references auth.users(id) on delete cascade,body text not null,created_at timestamptz default now(),read_at timestamptz);
create table public.favorites(id uuid primary key default gen_random_uuid(),listing_id uuid references public.listings(id),user_id uuid references auth.users(id));
create table public.user_push_tokens(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),expo_push_token text unique not null,
 updated_at timestamptz not null default now(),last_seen_at timestamptz not null default now(),platform text,device_id text,created_at timestamptz default now());
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;
-- Reproduce the observed Supabase defaults, including overbroad TRUNCATE grants.
grant all on public.conversations,public.messages,public.listings,public.favorites,public.user_push_tokens to anon,authenticated,service_role;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.listings enable row level security;
alter table public.favorites enable row level security;
create policy listings_public_select_published on public.listings for select using(status in ('active','published'));
create policy listings_owner_select on public.listings for select using(user_id=auth.uid());
create policy listings_owner_update on public.listings for update using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy conversations_select_participant on public.conversations for select to authenticated using(buyer_id=auth.uid() or seller_id=auth.uid());
create policy conversations_insert_buyer_or_seller on public.conversations for insert to authenticated with check((buyer_id=auth.uid() or seller_id=auth.uid()) and buyer_id<>seller_id);
create policy conversations_update_participant on public.conversations for update to authenticated using(buyer_id=auth.uid() or seller_id=auth.uid()) with check(buyer_id=auth.uid() or seller_id=auth.uid());
create policy messages_select_conversation_participant on public.messages for select to authenticated using(exists(select 1 from public.conversations c where c.id=conversation_id and auth.uid() in(c.buyer_id,c.seller_id)));
create policy messages_insert_sender on public.messages for insert to authenticated with check(sender_id=auth.uid() and exists(select 1 from public.conversations c where c.id=conversation_id and auth.uid() in(c.buyer_id,c.seller_id)));
create policy favorites_insert_own on public.favorites for insert to authenticated with check(user_id=auth.uid());
create policy favorites_select_own on public.favorites for select to authenticated using(user_id=auth.uid());
create policy favorites_delete_own on public.favorites for delete to authenticated using(user_id=auth.uid());
