-- Native Supabase PostgreSQL 17.x, synthetic rows from backend.py. No fixtures of auth.uid().
\set ON_ERROR_STOP on
begin;
create function pg_temp.assert(ok boolean,label text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; end$$;
select pg_temp.assert(not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in('r','p') and not c.relrowsecurity),'RLS enabled on all public tables');
select pg_temp.assert(not exists(select 1 from pg_views where schemaname='public' and definition ilike '%shops%'),'no public view exposes shop rows outside shops RLS');
select pg_temp.assert(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef and p.proname <> 'delete_my_account' and p.prosrc ilike '%shops%'),'no SECURITY DEFINER RPC bypasses shops visibility');
select pg_temp.assert(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and pg_get_function_result(p.oid) ilike '%shops%'),'no public RPC returns shop rows');
select pg_temp.assert(has_table_privilege('authenticated','public.user_push_tokens','select') and has_table_privilege('authenticated','public.user_push_tokens','delete'),'explicit token read/delete grants');
select pg_temp.assert(not has_table_privilege('anon','public.user_push_tokens','select'),'anon cannot read tokens');
select pg_temp.assert(not has_table_privilege('authenticated','public.user_push_tokens','truncate'),'clients cannot bypass token RLS with truncate');
select pg_temp.assert(not has_table_privilege('anon','public.shops','insert') and not has_table_privilege('authenticated','public.shops','delete') and not has_table_privilege('authenticated','public.shops','truncate'),'QA shops ACL is least-privilege');
select pg_temp.assert(not has_table_privilege('anon','public.user_credentials','select') and not has_table_privilege('authenticated','public.user_credentials','select') and not has_table_privilege('anon','public.auth_flow_tokens','select') and not has_table_privilege('authenticated','public.auth_flow_tokens','select'),'Web-only credential and token tables are not exposed to client roles');
select pg_temp.assert(not exists(select 1 from pg_policies where schemaname='public' and tablename in ('user_credentials','auth_flow_tokens')),'Web-only credential and token tables have no client RLS policy');
select pg_temp.assert((select count(*)=3 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('listing_drafts','user_credentials','auth_flow_tokens') and c.relrowsecurity),'all three Web-additional tables enforce RLS');
select pg_temp.assert((select count(*)=4 from pg_policies where schemaname='public' and tablename='listing_drafts' and (coalesce(qual,'') ilike '%auth.uid%' or coalesce(with_check,'') ilike '%auth.uid%')),'listing drafts retain four owner-scoped policies');
select pg_temp.assert(not has_table_privilege('anon','public.listing_drafts','select') and not has_table_privilege('authenticated','public.listing_drafts','select') and not has_table_privilege('service_role','public.listing_drafts','select'),'dormant listing drafts are not exposed to API roles');
select pg_temp.assert((select count(distinct conrelid)=3 from pg_constraint where contype='f' and confrelid='auth.users'::regclass and conrelid in ('public.listing_drafts'::regclass,'public.user_credentials'::regclass,'public.auth_flow_tokens'::regclass)),'all additional tables cascade from their Auth user');
select pg_temp.assert(to_regclass('public.listing_drafts_user_id_idx') is not null and to_regclass('public.user_credentials_updated_at_idx') is not null and to_regclass('public.auth_flow_tokens_user_purpose_idx') is not null and to_regclass('public.auth_flow_tokens_active_hash_uidx') is not null,'additional-table query and token uniqueness indexes exist');
select pg_temp.assert(not exists(select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('listing_drafts','user_credentials','auth_flow_tokens') and not t.tgisinternal),'additional tables have no hidden trigger execution');
select pg_temp.assert(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.prosrc ilike '%listing_drafts%' or p.prosrc ilike '%user_credentials%' or p.prosrc ilike '%auth_flow_tokens%')),'additional tables have no database RPC dependency');
select pg_temp.assert(not has_table_privilege('service_role','public.user_credentials','select') and not has_table_privilege('service_role','public.auth_flow_tokens','select'),'sourced Web credential/token tables have no service-role grant in this baseline');
select pg_temp.assert(not has_function_privilege('authenticated','public.claim_transactional_push(integer)','execute'),'claim restricted to server');
select pg_temp.assert(not has_function_privilege('anon','public.mark_conversation_read(uuid)','execute'),'read RPC not public');
select pg_temp.assert(not has_function_privilege('authenticated','push_private.guard_conversation_identity()','execute'),'guard helper not callable by users');
select pg_temp.assert((select count(*)=3 from pg_extension where extname in ('pg_net','pg_cron','supabase_vault')),'native required extensions');
set local role authenticated;
select set_config('request.jwt.claim.sub', :'buyer',true);
select pg_temp.assert((select count(*)=1 from public.conversations where id=:'thread'::uuid),'native auth.uid participant read');
select pg_temp.assert((select buyer_unread_count=0 from public.conversations where id=:'thread'::uuid),'legitimate metadata preserved');
do $$begin
 begin update public.conversations set seller_id=buyer_id; raise exception 'FAIL: identity mutation';
 exception when insufficient_privilege then null; end;
end$$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000099',true);
select pg_temp.assert((select count(*)=0 from public.conversations),'native RLS hides all third-party conversations');
reset role;
rollback;
\echo PASS native PostgreSQL roles/RLS/ACL/extensions, transaction rolled back.
