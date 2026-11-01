-- Qualified isolated QA only; all synthetic rows and assertions roll back.
BEGIN;
CREATE FUNCTION pg_temp.check_b(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL %',label; END IF; RAISE NOTICE 'PASS %',label; END $$;
CREATE TEMP TABLE b_sellers(id uuid);
INSERT INTO b_sellers SELECT gen_random_uuid() FROM generate_series(1,10);
INSERT INTO auth.users(id,email,raw_app_meta_data,raw_user_meta_data)
SELECT id,id::text||'@v5-03b.example.test','{}','{}' FROM b_sellers;
INSERT INTO public.listings(user_id,title,description,price,city,status,boosted)
SELECT id,'QA discovery','',100,'Douala','active',false FROM b_sellers CROSS JOIN generate_series(1,3);
INSERT INTO public.listings(user_id,title,description,price,city,status) VALUES
('10000000-0000-4000-8000-000000000001','QA private draft','',100,'Douala','draft'),
('10000000-0000-4000-8000-000000000001','QA private hidden','',100,'Douala','hidden'),
('10000000-0000-4000-8000-000000000001','QA private sold','',100,'Douala','sold'),
('10000000-0000-4000-8000-000000000001','QA private suspended','',100,'Douala','suspended');
SET LOCAL ROLE anon;
SELECT pg_temp.check_b((SELECT count(*)=30 FROM public.get_v5_discovery_listing_ids(0,50)),'anonymous active-only catalog');
SELECT pg_temp.check_b((SELECT count(DISTINCT l.user_id)=10 FROM public.get_v5_discovery_listing_ids(0,10) r JOIN public.listings l ON l.id=r.listing_id),'top ten organic sellers diversified');
SELECT pg_temp.check_b(NOT EXISTS(SELECT listing_id FROM public.get_v5_discovery_listing_ids(0,6) INTERSECT SELECT listing_id FROM public.get_v5_discovery_listing_ids(6,6)),'no cross-page duplicates');
SELECT pg_temp.check_b((SELECT array_agg(listing_id ORDER BY rank_position) FROM public.get_v5_discovery_listing_ids(0,12))=(SELECT array_agg(listing_id ORDER BY rank_position) FROM (SELECT * FROM public.get_v5_discovery_listing_ids(0,6) UNION ALL SELECT * FROM public.get_v5_discovery_listing_ids(6,6)) pages),'pages equal full global ranking');
SELECT pg_temp.check_b((SELECT count(*)=0 FROM public.get_v5_discovery_listing_ids(30,6)),'exhausted page');
SELECT pg_temp.check_b((SELECT count(*)=30 FROM public.get_v5_discovery_listing_ids(-1,999)),'offset and limit bounds');
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims='{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}';
SELECT pg_temp.check_b((SELECT count(*)=30 FROM public.get_v5_discovery_listing_ids(0,50)),'owner private rows excluded by RPC');
SET LOCAL request.jwt.claims='{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated"}';
SELECT pg_temp.check_b((SELECT count(*)=30 FROM public.get_v5_discovery_listing_ids(0,50)),'other user cannot discover private rows');
RESET ROLE;
ROLLBACK;
