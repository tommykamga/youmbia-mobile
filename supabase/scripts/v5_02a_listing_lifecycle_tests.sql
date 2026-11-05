-- Run ONLY via scripts/run-v5-02a-sql.sh on the qualified restored local baseline.
-- Real RLS/trigger tests; no synthetic marketplace schema. Everything rolls back.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
DO $$
BEGIN
  IF current_setting('server_version_num')::int NOT BETWEEN 170000 AND 179999
     OR to_regclass('auth.users') IS NULL
     OR to_regclass('public.listings') IS NULL
     OR to_regclass('public.listing_images') IS NULL
     OR to_regclass('public.admin_users') IS NULL
     OR to_regprocedure('public.guard_listing_lifecycle_owner()') IS NULL
     OR to_regprocedure('public.set_listings_renewed_at()') IS NULL
     OR to_regprocedure('public.set_listings_sale_cycle()') IS NULL THEN
    RAISE EXCEPTION 'SQL QA BLOCKED: restored PostgreSQL 17 baseline + V5-02A migration required';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.listings'::regclass)
     OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.listing_images'::regclass) THEN
    RAISE EXCEPTION 'SQL QA BLOCKED: baseline RLS disabled';
  END IF;
END $$;

-- Three existing sanitized fixtures, not production accounts. Do not modify auth/users/admin.
CREATE TEMP TABLE v5_02a_actors AS
SELECT
 (SELECT u.id FROM auth.users u WHERE NOT EXISTS
   (SELECT 1 FROM public.admin_users a WHERE a.email=u.email) ORDER BY u.id LIMIT 1) AS owner_id,
 (SELECT u.id FROM auth.users u WHERE NOT EXISTS
   (SELECT 1 FROM public.admin_users a WHERE a.email=u.email) ORDER BY u.id LIMIT 1 OFFSET 1) AS other_id,
 (SELECT u.id FROM auth.users u JOIN public.admin_users a ON a.email=u.email ORDER BY u.id LIMIT 1) AS admin_id;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM v5_02a_actors WHERE owner_id IS NULL OR other_id IS NULL OR admin_id IS NULL) THEN
   RAISE EXCEPTION 'SQL QA BLOCKED: need two non-admin auth fixtures and one admin fixture';
 END IF;
END $$;
GRANT SELECT ON v5_02a_actors TO authenticated, anon, service_role;
CREATE TEMP TABLE v5_02a_rows (source text PRIMARY KEY, id uuid, created_at timestamptz);
INSERT INTO public.listings(id,user_id,title,description,city,price,status)
SELECT gen_random_uuid(), owner_id, 'V5-02A isolated fixture', '', '', 1000, s::public.listing_status
FROM v5_02a_actors CROSS JOIN unnest(ARRAY['draft','active','hidden','sold','suspended']) s;
INSERT INTO v5_02a_rows
SELECT status::text,id,created_at FROM public.listings
WHERE title='V5-02A isolated fixture' AND user_id=(SELECT owner_id FROM v5_02a_actors);
GRANT SELECT ON v5_02a_rows TO authenticated, anon, service_role;
INSERT INTO public.listing_images(listing_id,url,sort_order)
SELECT r.id,a.owner_id::text||'/'||r.id::text||'/0.jpg',0
FROM v5_02a_rows r CROSS JOIN v5_02a_actors a;

-- Complete 5x5 owner matrix, including self transitions; each probe is rolled back.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',json_build_object('sub',owner_id,'role','authenticated')::text,true)
FROM v5_02a_actors;
DO $$
DECLARE r record; target text; allowed boolean; rejected boolean;
BEGIN
 FOR r IN SELECT * FROM v5_02a_rows LOOP
  FOREACH target IN ARRAY ARRAY['draft','active','hidden','sold','suspended'] LOOP
   allowed := r.source=target
     OR (r.source='draft' AND target='active')
     OR (r.source='active' AND target IN ('hidden','sold'))
     OR (r.source='hidden' AND target IN ('active','sold'))
     OR (r.source='sold' AND target='active');
   rejected := false;
   BEGIN
    BEGIN
     UPDATE public.listings SET status=target::public.listing_status WHERE id=r.id;
    EXCEPTION WHEN insufficient_privilege THEN rejected:=true;
    END;
    IF rejected=allowed THEN RAISE EXCEPTION 'FAIL owner matrix % -> %',r.source,target; END IF;
    RAISE SQLSTATE 'Z0001';
   EXCEPTION WHEN SQLSTATE 'Z0001' THEN NULL;
   END;
  END LOOP;
 END LOOP;
 RAISE NOTICE 'PASS owner transition matrix: 25 cases';
 IF (SELECT count(*) FROM public.listing_images WHERE listing_id IN (SELECT id FROM v5_02a_rows))<>5 THEN
   RAISE EXCEPTION 'FAIL owner photo metadata: expected all five statuses';
 END IF;
 RAISE NOTICE 'PASS owner photo metadata: 5 statuses';
END $$;

-- Owner INSERT matrix: legacy active/hidden and incomplete draft accepted;
-- sold/suspended creation forbidden even when sent directly to the Data API.
DO $$ DECLARE target text; rejected boolean; BEGIN
 FOREACH target IN ARRAY ARRAY['draft','active','hidden','sold','suspended'] LOOP
  rejected:=false;
  BEGIN
   BEGIN
    INSERT INTO public.listings(user_id,title,description,city,price,status,created_at)
    SELECT owner_id,'V5-02A insert matrix','','',0,target::public.listing_status,'2000-01-01'
    FROM v5_02a_actors;
   EXCEPTION WHEN insufficient_privilege THEN rejected:=true;
   END;
   IF rejected IS DISTINCT FROM (target IN ('sold','suspended')) THEN
    RAISE EXCEPTION 'FAIL owner initial status %',target;
   END IF;
   RAISE SQLSTATE 'Z0001';
  EXCEPTION WHEN SQLSTATE 'Z0001' THEN NULL;
  END;
 END LOOP;
 RAISE NOTICE 'PASS owner initial status matrix: 5 cases';
END $$;

-- Legacy client writes: active insert and hidden insert, drafts with empty description,
-- title/price/content edits, no new RPC/column required. Creation is server-owned.
DO $$
DECLARE new_id uuid; stamp timestamptz; published timestamptz; renewed timestamptz; cycle timestamptz;
BEGIN
 INSERT INTO public.listings(user_id,title,description,city,price,status,created_at)
 SELECT owner_id,'V5-02A legacy active','','',1000,'active','2099-01-01' FROM v5_02a_actors
 RETURNING id,created_at INTO new_id,stamp;
 IF stamp IS DISTINCT FROM now() THEN RAISE EXCEPTION 'FAIL insert created_at server time'; END IF;
 UPDATE public.listings SET title='Legacy edit',created_at='2000-01-01' WHERE id=new_id;
 UPDATE public.listings SET created_at='2099-01-01' WHERE id=new_id;
 SELECT last_published_at,renewed_at INTO published,renewed FROM public.listings WHERE id=new_id;
 IF (SELECT created_at FROM public.listings WHERE id=new_id) IS DISTINCT FROM stamp
    OR published IS DISTINCT FROM stamp OR renewed IS NOT NULL THEN
   RAISE EXCEPTION 'FAIL immutable creation / unchanged ranking';
 END IF;
 BEGIN
  UPDATE public.listings SET created_at='2000-01-01',renewed_at='2099-01-01' WHERE id=new_id;
  RAISE EXCEPTION 'FAIL cooldown bypass accepted';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT LIKE '%3 jours%' THEN RAISE; END IF;
 END;
 INSERT INTO public.listings(user_id,title,description,city,price,status)
 SELECT owner_id,'Brouillon','','',0,'draft' FROM v5_02a_actors RETURNING id,created_at INTO new_id,stamp;
 UPDATE public.listings SET title='Title only draft',description='' WHERE id=new_id;
 UPDATE public.listings SET description='Complete publication',price=1000,status='active' WHERE id=new_id;
 SELECT last_published_at,renewed_at,sale_cycle_started_at INTO published,renewed,cycle
 FROM public.listings WHERE id=new_id;
 IF (SELECT created_at FROM public.listings WHERE id=new_id) IS DISTINCT FROM stamp
    OR published IS DISTINCT FROM stamp OR renewed IS NOT NULL OR cycle IS NULL THEN
  RAISE EXCEPTION 'FAIL same-id draft publication timestamps';
 END IF;
 INSERT INTO public.listings(user_id,title,description,city,price,status)
 SELECT owner_id,'Legacy paused','','',1000,'hidden' FROM v5_02a_actors;
 RAISE NOTICE 'PASS legacy writes, draft same-id publication, creation and cooldown';
END $$;
RESET ROLE;

-- Seed an aged fixture only in this rollback transaction, never change existing rows.
-- Guard is disabled briefly as the isolated database owner to emulate a pre-migration row.
ALTER TABLE public.listings DISABLE TRIGGER listings_guard_lifecycle_owner;
UPDATE public.listings SET created_at=now()-interval '72 hours'
WHERE id=(SELECT id FROM v5_02a_rows WHERE source='active');
ALTER TABLE public.listings ENABLE TRIGGER listings_guard_lifecycle_owner;
SET LOCAL ROLE authenticated;
DO $$
DECLARE r public.listings;
BEGIN
 UPDATE public.listings SET renewed_at='2099-01-01'
 WHERE id=(SELECT id FROM v5_02a_rows WHERE source='active') RETURNING * INTO r;
 IF r.renewed_at IS DISTINCT FROM now() OR r.last_published_at IS DISTINCT FROM now()
    OR r.created_at IS DISTINCT FROM now()-interval '72 hours' THEN
   RAISE EXCEPTION 'FAIL renewal at 72h boundary';
 END IF;
 BEGIN
  UPDATE public.listings SET renewed_at='2099-01-01' WHERE id=r.id;
  RAISE EXCEPTION 'FAIL duplicate renewal accepted';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT LIKE '%3 jours%' THEN RAISE; END IF;
 END;
 RAISE NOTICE 'PASS 72h renewal and immediate replay rejection';
END $$;

-- Other user: public active photo only, no private metadata; no cross-owner update.
SELECT set_config('request.jwt.claims',json_build_object('sub',other_id,'role','authenticated')::text,true)
FROM v5_02a_actors;
DO $$ DECLARE n integer; BEGIN
 IF (SELECT count(*) FROM public.listing_images WHERE listing_id IN (SELECT id FROM v5_02a_rows))<>1 THEN
  RAISE EXCEPTION 'FAIL cross-user photo visibility'; END IF;
 UPDATE public.listings SET title='Cross owner forbidden' WHERE id IN (SELECT id FROM v5_02a_rows);
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>0 THEN RAISE EXCEPTION 'FAIL cross-owner write'; END IF;
 RAISE NOTICE 'PASS cross-user RLS';
END $$;
RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims','{}',true);
DO $$ BEGIN
 IF (SELECT count(*) FROM public.listing_images WHERE listing_id IN (SELECT id FROM v5_02a_rows))<>1 THEN
  RAISE EXCEPTION 'FAIL anonymous private metadata disclosure'; END IF;
 RAISE NOTICE 'PASS anonymous photo RLS';
END $$;
RESET ROLE;

-- Existing admin authorization, through authenticated role (not a superuser shortcut).
SELECT set_config('request.jwt.claims',json_build_object('sub',u.id,'email',u.email,'role','authenticated')::text,true)
FROM auth.users u WHERE u.id=(SELECT admin_id FROM v5_02a_actors);
SET LOCAL ROLE authenticated;

DO $$ DECLARE n integer; r record; target text; BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'SQL QA BLOCKED: admin fixture authorization failed'; END IF;
 FOR r IN SELECT * FROM v5_02a_rows LOOP
  FOREACH target IN ARRAY ARRAY['draft','active','hidden','sold','suspended'] LOOP
   BEGIN
    UPDATE public.listings SET status=target::public.listing_status WHERE id=r.id;
    GET DIAGNOSTICS n=ROW_COUNT;
    IF n<>1 THEN RAISE EXCEPTION 'FAIL moderator matrix % -> %',r.source,target; END IF;
    RAISE SQLSTATE 'Z0001';
   EXCEPTION WHEN SQLSTATE 'Z0001' THEN NULL;
   END;
  END LOOP;
 END LOOP;
 RAISE NOTICE 'PASS authenticated moderator transition matrix: 25 cases';
 UPDATE public.listings SET status='active' WHERE id=(SELECT id FROM v5_02a_rows WHERE source='suspended');
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>1 THEN RAISE EXCEPTION 'FAIL admin restoration'; END IF;
 UPDATE public.listings SET status='suspended' WHERE id=(SELECT id FROM v5_02a_rows WHERE source='active');
 RAISE NOTICE 'PASS authenticated moderator restoration and suspension';
END $$;
RESET ROLE;
ROLLBACK;
