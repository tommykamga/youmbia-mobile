-- Minimal observed production contracts, NOT a replica of production migration history.
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth;
create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create table auth.users(id uuid primary key);
create table public.conversations(id uuid primary key,buyer_id uuid,seller_id uuid);
create table public.messages(id uuid primary key default gen_random_uuid(),conversation_id uuid,sender_id uuid,body text);
create table public.listings(id uuid primary key,user_id uuid,status text);
create table public.favorites(id uuid primary key default gen_random_uuid(),listing_id uuid,user_id uuid);
create table public.user_push_tokens(id uuid primary key default gen_random_uuid(),user_id uuid,expo_push_token text,updated_at timestamptz default now());
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;
