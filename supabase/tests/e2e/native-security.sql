-- Native Supabase PostgreSQL 17.x, synthetic rows from backend.py. No fixtures of auth.uid().
\set ON_ERROR_STOP on
begin;
create function pg_temp.assert(ok boolean,label text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; end$$;
select pg_temp.assert(not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in('r','p') and not c.relrowsecurity),'RLS enabled on all public tables');
select pg_temp.assert(has_table_privilege('authenticated','public.user_push_tokens','select') and has_table_privilege('authenticated','public.user_push_tokens','delete'),'explicit token read/delete grants');
select pg_temp.assert(not has_table_privilege('anon','public.user_push_tokens','select'),'anon cannot read tokens');
select pg_temp.assert(not has_table_privilege('authenticated','public.user_push_tokens','truncate'),'clients cannot bypass token RLS with truncate');
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
