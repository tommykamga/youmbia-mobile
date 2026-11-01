-- Qualified isolated local QA only. Never run on Production. All test fixtures ROLLBACK.
BEGIN;
CREATE FUNCTION pg_temp.check_release(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF ok IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'FAIL %',label; END IF; RAISE NOTICE 'PASS %',label; END $$;
CREATE TEMP TABLE release_listing AS SELECT gen_random_uuid() id;
INSERT INTO public.listings(id,user_id,title,description,price,city,status) SELECT id,'10000000-0000-4000-8000-000000000001','QA release favorite','QA',100,'Douala','active' FROM release_listing;
GRANT SELECT ON release_listing TO authenticated;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims='{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated"}';
INSERT INTO public.favorites(user_id,listing_id) SELECT auth.uid(),id FROM release_listing;
SELECT pg_temp.check_release((SELECT count(*)=1 FROM public.favorites WHERE listing_id=(SELECT id FROM release_listing)),'favorite persists for its owner');
SET LOCAL request.jwt.claims='{"sub":"30000000-0000-4000-8000-000000000003","role":"authenticated"}';
SELECT pg_temp.check_release((SELECT count(*)=0 FROM public.favorites WHERE listing_id=(SELECT id FROM release_listing)),'other account cannot read private favorite');
DO $$ BEGIN BEGIN INSERT INTO public.favorites(user_id,listing_id) SELECT '20000000-0000-4000-8000-000000000002',id FROM release_listing; RAISE EXCEPTION 'forged owner accepted'; EXCEPTION WHEN insufficient_privilege THEN PERFORM pg_temp.check_release(TRUE,'forged favorite actor rejected'); END; END $$;
SET LOCAL request.jwt.claims='{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated"}';
DELETE FROM public.favorites WHERE listing_id=(SELECT id FROM release_listing);
SELECT pg_temp.check_release((SELECT count(*)=0 FROM public.favorites WHERE listing_id=(SELECT id FROM release_listing)),'favorite removal persists');
RESET ROLE;
ROLLBACK;
