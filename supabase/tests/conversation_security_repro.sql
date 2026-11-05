-- Execute BEFORE the corrective migration, only on the synthetic local fixture.
\set ON_ERROR_STOP on
begin;
insert into auth.users values('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002'),('00000000-0000-0000-0000-000000000003');
insert into listings values('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','active');
set local role authenticated;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
-- Before: an authenticated buyer can impersonate the seller without being the listing owner.
insert into conversations(id,listing_id,buyer_id,seller_id) values('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003');
update conversations set seller_id='00000000-0000-0000-0000-000000000002' where id='10000000-0000-0000-0000-000000000001';
reset role;
do $$begin
 if not exists(select 1 from conversations where seller_id='00000000-0000-0000-0000-000000000002') then raise exception 'reproduction did not occur'; end if;
 if not has_table_privilege('authenticated','conversations','truncate') then raise exception 'expected baseline privilege missing'; end if;
 if not has_function_privilege('anon','mark_conversation_read(uuid)','execute') then raise exception 'expected explicit anon grant missing'; end if;
end$$;
rollback;
\echo CONFIRMED local baseline: forged seller accepted, identity update accepted, TRUNCATE privilege present.
