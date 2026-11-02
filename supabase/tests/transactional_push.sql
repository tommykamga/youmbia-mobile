\set ON_ERROR_STOP on
begin;
create function pg_temp.assert(ok boolean,label text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; end$$;
insert into auth.users (id, email) values
('00000000-0000-0000-0000-000000000001','push-fixture-a@ymb-e2e.invalid'),
('00000000-0000-0000-0000-000000000002','push-fixture-b@ymb-e2e.invalid'),
('00000000-0000-0000-0000-000000000003','push-fixture-c@ymb-e2e.invalid');
insert into public.listings (id,user_id,title,description,price,city,status)
values ('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002',
        'Synthetic SQL fixture','Synthetic transactional push test listing',1000,'Synthetic City','active');
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
insert into conversations(id,listing_id,buyer_id,seller_id) values('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002');
insert into messages(conversation_id,sender_id,body) values('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','private');
select pg_temp.assert((select count(*)=0 from transactional_push_events),'OFF by default');
delete from messages;
update transactional_push_config set messages_enabled=true,favorites_enabled=true;
insert into messages(conversation_id,sender_id,body) values
('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','first'),
('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','second'),
('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','reply'),
('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003','outsider');
select pg_temp.assert((select count(*)=3 from transactional_push_events),'participants only, one event each');
select pg_temp.assert((select count(*)=1 from transactional_push_events where first_contact),'first contact once');
select pg_temp.assert((select count(*)=1 from transactional_push_events where recipient_id='00000000-0000-0000-0000-000000000001'),'seller replies to buyer');
insert into transactional_push_events(kind,source_id,recipient_id,target_id) select kind,source_id,recipient_id,target_id from transactional_push_events on conflict do nothing;
select pg_temp.assert((select count(*)=3 from transactional_push_events),'replay idempotent');
insert into user_push_tokens(user_id,expo_push_token) values
('00000000-0000-0000-0000-000000000002','ExpoPushToken[sellerA]'),
('00000000-0000-0000-0000-000000000002','ExpoPushToken[sellerB]'),
('00000000-0000-0000-0000-000000000001','ExpoPushToken[buyer]');
select pg_temp.assert((select count(*)=5 from claim_transactional_push()),'fanout per recipient, no sender device');
select pg_temp.assert((select count(*)=0 from claim_transactional_push()),'claimed once');
update transactional_push_deliveries set claimed_at=now()-interval '6 minutes';
select * from claim_transactional_push();
select pg_temp.assert((select bool_and(state='uncertain') from transactional_push_deliveries),'expired lease never retried');
insert into favorites(listing_id,user_id) values('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002');
select pg_temp.assert((select count(*)=0 from transactional_push_events where kind='favorite'),'self favorite skipped');
insert into favorites(listing_id,user_id) values('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001');
delete from favorites;
insert into favorites(listing_id,user_id) values('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001');
select pg_temp.assert((select count(*)=1 from transactional_push_events where kind='favorite'),'favorite remove/readd cooldown');
insert into transactional_push_preferences values('00000000-0000-0000-0000-000000000002',false);
select pg_temp.assert((select count(*)=0 from claim_transactional_push()),'opt out before dispatch');
select pg_temp.assert((select count(*)=2 from transactional_push_deliveries where state='skipped'),'both devices skipped');
select pg_temp.assert(not has_table_privilege('authenticated','transactional_push_events','select'),'events denied');
select pg_temp.assert(not has_table_privilege('anon','transactional_push_deliveries','select'),'deliveries denied');
select pg_temp.assert(not has_function_privilege('authenticated','claim_transactional_push(integer)','execute'),'claim denied');
select pg_temp.assert(not has_function_privilege('anon','transactional_message_push_enabled()','execute'),'config RPC denied');
set local role authenticated;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
select pg_temp.assert((select count(*)=0 from transactional_push_preferences),'RLS other preference hidden');
do $$begin
 begin
 insert into transactional_push_preferences values('00000000-0000-0000-0000-000000000003',false);
 raise exception 'FAIL: cross user preference write';
 exception when insufficient_privilege then null;
 end;
end$$;
insert into transactional_push_preferences values('00000000-0000-0000-0000-000000000001',false);
select pg_temp.assert((select count(*)=1 from transactional_push_preferences),'RLS own preference');
reset role;
-- Permission revoked / logout: deletion removes pending device work, no push survives logout.
delete from user_push_tokens where expo_push_token='ExpoPushToken[buyer]';
select pg_temp.assert(not exists(select 1 from transactional_push_deliveries d join user_push_tokens t on t.id=d.token_id where t.expo_push_token='ExpoPushToken[buyer]'),'logout device removed');
-- Late invalid-token receipts must not delete a freshly re-registered token.
update transactional_push_deliveries set state='failed',error_code='DeviceNotRegistered' where token_id=(select id from user_push_tokens where expo_push_token='ExpoPushToken[sellerA]');
update user_push_tokens set updated_at=now()+interval '1 second' where expo_push_token='ExpoPushToken[sellerA]';
select invalidate_transactional_push_token(id) from transactional_push_deliveries where error_code='DeviceNotRegistered';
select pg_temp.assert(exists(select 1 from user_push_tokens where expo_push_token='ExpoPushToken[sellerA]'),'new registration survives old receipt');
-- Freshly registered invalid token may be deleted only for the original owner/version.
update transactional_push_deliveries d set token_version=t.updated_at from user_push_tokens t where d.token_id=t.id and d.error_code='DeviceNotRegistered';
select invalidate_transactional_push_token(id) from transactional_push_deliveries where error_code='DeviceNotRegistered';
select pg_temp.assert(not exists(select 1 from user_push_tokens where expo_push_token='ExpoPushToken[sellerA]'),'invalid token removed');
-- Inactive listing and opted-out owner cannot create new favorite events.
delete from push_private.favorite_cooldowns;
insert into favorites(listing_id,user_id) values('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003');
select pg_temp.assert((select count(*)=1 from transactional_push_events where kind='favorite'),'owner opt out at insertion');
update transactional_push_preferences set favorites_enabled=true;
update listings set status='hidden';
delete from favorites where listing_id='20000000-0000-0000-0000-000000000001' and user_id='00000000-0000-0000-0000-000000000003';
insert into favorites(listing_id,user_id) values('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003');
select pg_temp.assert((select count(*)=1 from transactional_push_events where kind='favorite'),'inactive listing skipped');
rollback;
