-- Dedicated, qualified QA baseline only. No migration or network connection is made here.
BEGIN;
CREATE FUNCTION pg_temp.assert_v5c(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL %',label; END IF;
RAISE NOTICE 'PASS %',label; END $$;
CREATE TEMP TABLE c_ids(id uuid);
GRANT SELECT ON c_ids TO authenticated;
WITH l AS (INSERT INTO public.listings(user_id,title,description,price,city,status)
VALUES('10000000-0000-4000-8000-000000000001','QA first','',1,'','draft') RETURNING id)
INSERT INTO c_ids SELECT id FROM l;
-- Privileged fixture setup only: emulate a draft predating the V5-02A guard.
-- Re-enable the immutable timestamp guard BEFORE every authenticated assertion.
ALTER TABLE public.listings DISABLE TRIGGER listings_guard_lifecycle_owner;
UPDATE public.listings SET created_at=now()-interval '10 days' WHERE id=(SELECT id FROM c_ids);
ALTER TABLE public.listings ENABLE TRIGGER listings_guard_lifecycle_owner;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims='{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}';
SELECT pg_temp.assert_v5c((SELECT count(*)=0 FROM public.listing_first_publications),'draft excluded');
UPDATE public.listings SET status='active' WHERE id=(SELECT id FROM c_ids);
SELECT pg_temp.assert_v5c((SELECT first_published_at>created_at+interval '9 days' FROM public.listings WHERE id=(SELECT id FROM c_ids)),'old draft counted at publication');
UPDATE public.listings SET first_published_at='2099-01-01' WHERE id=(SELECT id FROM c_ids);
SELECT pg_temp.assert_v5c((SELECT first_published_at<'2099-01-01' FROM public.listings WHERE id=(SELECT id FROM c_ids)),'first timestamp immutable');
UPDATE public.listings SET status='sold' WHERE id=(SELECT id FROM c_ids);
UPDATE public.listings SET status='active' WHERE id=(SELECT id FROM c_ids);
SELECT pg_temp.assert_v5c((SELECT count(*)=1 FROM public.listing_first_publications),'reactivation not recounted');
DO $$ BEGIN
 BEGIN UPDATE public.listing_first_publications SET published_at=now(); RAISE EXCEPTION 'write accepted';
 EXCEPTION WHEN insufficient_privilege THEN PERFORM pg_temp.assert_v5c(true,'ledger writes forbidden'); END;
END $$;
SET LOCAL request.jwt.claims='{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated"}';
SELECT pg_temp.assert_v5c((SELECT count(*)=0 FROM public.listing_first_publications),'other owner cannot read facts');
SET LOCAL request.jwt.claims='{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}';
DELETE FROM public.listings WHERE id=(SELECT id FROM c_ids);
SELECT pg_temp.assert_v5c((SELECT count(*)=1 FROM public.listing_first_publications),'deletion preserves quota fact');
RESET ROLE;
INSERT INTO public.listing_first_publications SELECT gen_random_uuid(),'10000000-0000-4000-8000-000000000001',clock_timestamp() FROM generate_series(1,99);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 BEGIN
 INSERT INTO public.listings(user_id,title,description,price,city,status) VALUES(auth.uid(),'QA overflow','',1,'','active');
 RAISE EXCEPTION 'quota bypass';
 EXCEPTION WHEN check_violation THEN PERFORM pg_temp.assert_v5c(true,'101st legacy insert rejected'); END;
END $$;
RESET ROLE;
UPDATE public.listing_first_publications SET published_at=clock_timestamp()-interval '24 hours';
SET LOCAL ROLE authenticated;
INSERT INTO public.listings(user_id,title,description,price,city,status) VALUES(auth.uid(),'QA after window','',1,'','active');
SELECT pg_temp.assert_v5c((SELECT count(*)=101 FROM public.listing_first_publications),'rolling window expires at 24h');
SELECT pg_temp.assert_v5c((SELECT count(*)=1 FROM public.listing_first_publications WHERE published_at>clock_timestamp()-interval '24 hours'),'legacy active insert creates one server fact');
RESET ROLE;
ROLLBACK;
