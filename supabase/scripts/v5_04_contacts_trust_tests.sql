-- Qualified isolated native Supabase baseline only. Entire suite rolls back.
BEGIN;
CREATE FUNCTION pg_temp.check_v4(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL %',label; END IF; RAISE NOTICE 'PASS %',label; END $$;
CREATE TEMP TABLE v4_lists(pos integer,id uuid);
INSERT INTO v4_lists SELECT n,gen_random_uuid() FROM generate_series(1,6) n;
INSERT INTO public.listings(id,user_id,title,description,price,city,status)
SELECT id,'10000000-0000-4000-8000-000000000001','QA V5-04','',100,'Douala','active' FROM v4_lists;
CREATE TEMP TABLE v4_event(id uuid,lid uuid,session uuid);
INSERT INTO v4_event SELECT gen_random_uuid(),id,gen_random_uuid() FROM v4_lists WHERE pos=1;
GRANT SELECT ON v4_lists,v4_event TO authenticated,anon;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims='{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated"}';
SELECT public.record_v5_contact_intent(id,lid,'whatsapp','ios','search','listing_detail',session) FROM v4_event;
SELECT public.record_v5_contact_intent(id,lid,'whatsapp','ios','search','listing_detail',session) FROM v4_event;
SELECT pg_temp.check_v4((SELECT count(*)=1 FROM public.marketplace_contact_intents),'same event replay counted once');
SELECT pg_temp.check_v4((SELECT city='Douala' AND occurred_at=received_at AND received_at<=clock_timestamp() FROM public.marketplace_contact_intents),'server time and listing dimensions');
DO $$ BEGIN
 BEGIN UPDATE public.marketplace_contact_intents SET channel='call'; RAISE EXCEPTION 'direct write accepted'; EXCEPTION WHEN insufficient_privilege THEN PERFORM pg_temp.check_v4(true,'direct event writes denied'); END;
 BEGIN PERFORM public.record_v5_contact_intent(id,lid,'call','ios','search','listing_detail',session) FROM v4_event; RAISE EXCEPTION 'conflicting replay'; EXCEPTION WHEN invalid_parameter_value THEN PERFORM pg_temp.check_v4(true,'conflicting replay denied'); END;
 BEGIN PERFORM public.record_v5_contact_intent(gen_random_uuid(),lid,'invalid','ios','search','listing_detail',session) FROM v4_event; RAISE EXCEPTION 'invalid channel'; EXCEPTION WHEN check_violation THEN PERFORM pg_temp.check_v4(true,'invalid channel denied'); END;
 BEGIN PERFORM public.declare_v5_listing_availability(lid,'available','active') FROM v4_event; RAISE EXCEPTION 'other owner declaration'; EXCEPTION WHEN insufficient_privilege THEN PERFORM pg_temp.check_v4(true,'other owner declaration denied'); END;
END $$;
SET LOCAL request.jwt.claims='{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}';
SELECT pg_temp.check_v4((SELECT count(*)=0 FROM public.marketplace_contact_intents),'contact RLS cross-user isolation');
DO $$ BEGIN
 BEGIN PERFORM public.record_v5_contact_intent(gen_random_uuid(),lid,'call','ios','home','listing_detail',session) FROM v4_event; RAISE EXCEPTION 'self contact'; EXCEPTION WHEN insufficient_privilege THEN PERFORM pg_temp.check_v4(true,'self contact excluded'); END;
 BEGIN PERFORM public.record_v5_contact_intent(id,lid,'whatsapp','ios','search','listing_detail',session) FROM v4_event; RAISE EXCEPTION 'other actor replay'; EXCEPTION WHEN insufficient_privilege THEN PERFORM pg_temp.check_v4(true,'another actor cannot replay an existing UUID'); END;
 BEGIN PERFORM public.declare_v5_listing_availability(lid,'available','hidden') FROM v4_event; RAISE EXCEPTION 'stale expected status'; EXCEPTION WHEN invalid_parameter_value THEN PERFORM pg_temp.check_v4(true,'stale availability refused'); END;
END $$;
SELECT public.declare_v5_listing_availability(lid,'available','active') FROM v4_event;
SELECT pg_temp.check_v4((SELECT state='available' AND confirmed_at IS NOT NULL FROM public.get_v5_listing_availability((SELECT lid FROM v4_event))),'availability server confirmation');
SELECT public.declare_v5_listing_availability(lid,'unknown','active') FROM v4_event;
SELECT pg_temp.check_v4((SELECT state='unknown' FROM public.get_v5_listing_availability((SELECT lid FROM v4_event))),'unknown is explicit and non-forced');
SELECT public.declare_v5_listing_availability(lid,'sold','active') FROM v4_event;
SELECT pg_temp.check_v4((SELECT status='sold' FROM public.listings WHERE id=(SELECT lid FROM v4_event)),'sold uses existing lifecycle transition');
SET LOCAL ROLE anon;
SET LOCAL request.jwt.claims='{"role":"anon"}';
SELECT pg_temp.check_v4((SELECT count(*)=0 FROM public.get_v5_listing_availability((SELECT lid FROM v4_event))),'non-public availability hidden from anonymous');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims='{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}';
UPDATE public.listings SET status='active' WHERE id=(SELECT lid FROM v4_event);
SELECT pg_temp.check_v4((SELECT state='unknown' FROM public.get_v5_listing_availability((SELECT lid FROM v4_event))),'legacy reactivation clears previous declaration');
RESET ROLE;
INSERT INTO public.marketplace_contact_intents(event_id,actor_id,listing_id,channel,platform,source,entry_point,session_key,occurred_at,received_at)
SELECT gen_random_uuid(),'20000000-0000-4000-8000-000000000002',lid,'message','android','other','listing_detail',session,clock_timestamp(),clock_timestamp() FROM v4_event CROSS JOIN generate_series(1,59);
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims='{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated"}';
DO $$ BEGIN
 BEGIN PERFORM public.record_v5_contact_intent(gen_random_uuid(),lid,'sms','android','other','auth_return',session) FROM v4_event; RAISE EXCEPTION 'rate bypass'; EXCEPTION WHEN program_limit_exceeded THEN PERFORM pg_temp.check_v4(true,'60 per minute rate limit'); END;
END $$;
SELECT pg_temp.check_v4((SELECT public.record_v5_contact_intent(id,lid,'whatsapp','ios','search','listing_detail',session)=id FROM v4_event),'idempotent retry allowed at rate cap');
RESET ROLE;
UPDATE public.marketplace_contact_intents SET received_at=now()-interval '31 days' WHERE event_id=(SELECT id FROM v4_event);
SET LOCAL ROLE service_role;
SELECT pg_temp.check_v4(v5_marketplace_private.purge_contacts()=1,'explicit 30 day retention purge');
RESET ROLE;
SET LOCAL ROLE anon;
DO $$ BEGIN
 BEGIN PERFORM public.record_v5_contact_intent(id,lid,'message','web','other','listing_detail',session) FROM v4_event; RAISE EXCEPTION 'anonymous telemetry accepted'; EXCEPTION WHEN insufficient_privilege THEN PERFORM pg_temp.check_v4(true,'anonymous journal writes denied'); END;
 BEGIN PERFORM * FROM public.marketplace_contact_intents; RAISE EXCEPTION 'anonymous contact read'; EXCEPTION WHEN insufficient_privilege THEN PERFORM pg_temp.check_v4(true,'anonymous contact reads denied'); END;
END $$;
SELECT pg_temp.check_v4(NOT public.is_v5_verified_subject('profile','10000000-0000-4000-8000-000000000001'),'no proof no verification claim');
RESET ROLE;
INSERT INTO v5_marketplace_private.verification_evidence(subject_type,subject_id,policy_version,proof_reference)
VALUES('profile','10000000-0000-4000-8000-000000000001','synthetic-policy-not-production','synthetic-reference');
SET LOCAL ROLE anon;
SELECT pg_temp.check_v4(public.is_v5_verified_subject('profile','10000000-0000-4000-8000-000000000001'),'explicit proof enables boolean receipt');
SELECT pg_temp.check_v4((SELECT verification_proven FROM public.get_v5_verified_subjects('profile',ARRAY['10000000-0000-4000-8000-000000000001'::uuid])),'anonymous batch exposes boolean proof receipt only');
DO $$ BEGIN
 BEGIN PERFORM * FROM v5_marketplace_private.verification_evidence; RAISE EXCEPTION 'proof leaked'; EXCEPTION WHEN insufficient_privilege THEN PERFORM pg_temp.check_v4(true,'proof references never public'); END;
END $$;
RESET ROLE;
UPDATE v5_marketplace_private.verification_evidence SET revoked_at=now() WHERE subject_id='10000000-0000-4000-8000-000000000001';
SELECT pg_temp.check_v4(NOT public.is_v5_verified_subject('profile','10000000-0000-4000-8000-000000000001'),'revocation removes badge receipt');
CREATE TEMP TABLE v4_convs(pos integer,id uuid);
WITH c AS(INSERT INTO public.conversations(listing_id,buyer_id,seller_id)
 SELECT id,'20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001' FROM v4_lists WHERE pos<=5 RETURNING id,listing_id)
INSERT INTO v4_convs SELECT l.pos,c.id FROM c JOIN v4_lists l ON l.id=c.listing_id;
GRANT SELECT ON v4_convs TO authenticated;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims='{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated"}';
INSERT INTO public.messages(conversation_id,sender_id,body,created_at,server_received_at)
SELECT id,auth.uid(),'buyer','2099-01-01','2099-01-01' FROM v4_convs WHERE pos<>4;
DO $$ BEGIN BEGIN
 INSERT INTO public.messages(conversation_id,sender_id,body) SELECT id,'10000000-0000-4000-8000-000000000001','forged seller' FROM v4_convs WHERE pos=1;
 RAISE EXCEPTION 'forged sender accepted'; EXCEPTION WHEN insufficient_privilege THEN PERFORM pg_temp.check_v4(true,'buyer cannot forge a seller message'); END; END $$;
SELECT pg_temp.check_v4((SELECT bool_and(server_context_key IS NOT NULL AND server_received_at<clock_timestamp() AND server_received_at<'2099-01-01') FROM public.messages),'legacy message insert uses trusted receive timestamp');
DO $$ BEGIN
 BEGIN PERFORM * FROM public.get_v5_seller_response_metrics('10000000-0000-4000-8000-000000000001'); RAISE EXCEPTION 'non-admin metrics'; EXCEPTION WHEN insufficient_privilege THEN PERFORM pg_temp.check_v4(true,'response aggregates admin only'); END;
END $$;
SET LOCAL request.jwt.claims='{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}';
INSERT INTO public.messages(conversation_id,sender_id,body) SELECT id,auth.uid(),'seller after' FROM v4_convs WHERE pos IN(1,4,5);
RESET ROLE;
-- Privileged fixture dates model ordering/ties and genuinely historical messages.
-- Every runtime assertion above and below executes with the stamp trigger enabled.
ALTER TABLE public.messages DISABLE TRIGGER messages_v5_received;
UPDATE public.messages m SET server_received_at=CASE WHEN c.pos=3 THEN NULL WHEN m.body='buyer' THEN '2026-01-01 00:00:00Z'::timestamptz WHEN c.pos=5 THEN '2026-01-01 00:00:30Z'::timestamptz ELSE '2026-01-01 00:00:10Z'::timestamptz END FROM v4_convs c WHERE m.conversation_id=c.id;
INSERT INTO public.messages(conversation_id,sender_id,body,server_received_at)
SELECT id,'10000000-0000-4000-8000-000000000001','seller before','2025-12-31 23:59:59Z' FROM v4_convs WHERE pos=1;
INSERT INTO public.messages(conversation_id,sender_id,body,server_received_at)
SELECT id,'10000000-0000-4000-8000-000000000001','seller equal','2026-01-01 00:00:00Z' FROM v4_convs WHERE pos=1;
UPDATE public.messages m SET server_context_key=md5(c.listing_id::text||':'||c.buyer_id::text||':'||c.seller_id::text) FROM public.conversations c WHERE c.id=m.conversation_id;
ALTER TABLE public.messages ENABLE TRIGGER messages_v5_received;
UPDATE public.messages SET server_received_at='2099-01-01',server_context_key='forged' WHERE body='seller after';
SELECT pg_temp.check_v4(NOT EXISTS(SELECT 1 FROM public.messages WHERE server_received_at='2099-01-01' OR server_context_key='forged'),'receive timestamp immutable on update');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims='{"sub":"30000000-0000-4000-8000-000000000003","email":"moderator@v5-02a.example.test","role":"authenticated"}';
SELECT pg_temp.check_v4(eligible_conversations=3,'response denominator requires real buyer message') FROM public.get_v5_seller_response_metrics('10000000-0000-4000-8000-000000000001');
SELECT pg_temp.check_v4(responded_conversations=2,'strictly later first seller replies only') FROM public.get_v5_seller_response_metrics('10000000-0000-4000-8000-000000000001');
SELECT pg_temp.check_v4(unanswered_conversations=1,'unanswered conversations separate') FROM public.get_v5_seller_response_metrics('10000000-0000-4000-8000-000000000001');
SELECT pg_temp.check_v4(excluded_legacy_conversations=1,'historical untrusted timestamps excluded') FROM public.get_v5_seller_response_metrics('10000000-0000-4000-8000-000000000001');
SELECT pg_temp.check_v4(median_first_response_seconds=20,'median uses first internal response after buyer') FROM public.get_v5_seller_response_metrics('10000000-0000-4000-8000-000000000001');
SELECT pg_temp.check_v4(eligible_conversations=0 AND median_first_response_seconds IS NULL,'insufficient response data is null not zero delay') FROM public.get_v5_seller_response_metrics('20000000-0000-4000-8000-000000000002');
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims='{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}';
UPDATE public.conversations SET buyer_id='30000000-0000-4000-8000-000000000003' WHERE id=(SELECT id FROM v4_convs WHERE pos=2);
SET LOCAL request.jwt.claims='{"sub":"30000000-0000-4000-8000-000000000003","email":"moderator@v5-02a.example.test","role":"authenticated"}';
SELECT pg_temp.check_v4(eligible_conversations=2 AND excluded_legacy_conversations=2,'mutated conversation context cannot contaminate response metric') FROM public.get_v5_seller_response_metrics('10000000-0000-4000-8000-000000000001');
SET LOCAL request.jwt.claims='{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated"}';
INSERT INTO public.conversations(listing_id,buyer_id,seller_id)
SELECT id,auth.uid(),'30000000-0000-4000-8000-000000000003' FROM v4_lists WHERE pos=6;
INSERT INTO public.messages(conversation_id,sender_id,body)
SELECT id,auth.uid(),'buyer invalid seller context' FROM public.conversations WHERE listing_id=(SELECT id FROM v4_lists WHERE pos=6);
SET LOCAL request.jwt.claims='{"sub":"30000000-0000-4000-8000-000000000003","email":"moderator@v5-02a.example.test","role":"authenticated"}';
SELECT pg_temp.check_v4(eligible_conversations=0 AND excluded_legacy_conversations=1,'seller must match listing owner for trusted metric') FROM public.get_v5_seller_response_metrics('30000000-0000-4000-8000-000000000003');
RESET ROLE;
ROLLBACK;
