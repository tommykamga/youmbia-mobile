-- Qualified QA only; fixture metadata, not real Storage HTTP uploads. All rolled back.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
DO $$ BEGIN
 IF current_setting('server_version_num')::int NOT BETWEEN 170000 AND 179999
 OR to_regprocedure('public.finalize_listing_publication(uuid)') IS NULL THEN
  RAISE EXCEPTION 'SQL QA BLOCKED: qualified PG17 baseline plus V5-02B required'; END IF;
END $$;
CREATE TEMP TABLE qa_results(label text NOT NULL);
GRANT SELECT,INSERT ON qa_results TO authenticated,anon;
CREATE FUNCTION pg_temp.qa_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL %',label; END IF;
 INSERT INTO pg_temp.qa_results VALUES(label);
END $$;
CREATE TEMP TABLE qa_ids(id uuid,owner_id uuid);
GRANT SELECT ON qa_ids TO authenticated,anon;
INSERT INTO public.categories(id,name,slug) VALUES (910001,'QA root','qa-root');
INSERT INTO public.categories(id,name,slug,parent_id,form_profile)
 VALUES (910002,'QA leaf','qa-leaf',910001,'v5-02b-qa'),(910003,'QA override','qa-override',910001,'v5-02b-qa');
INSERT INTO public.category_attribute_definitions(id,key,label_fr,type,required,form_profile)
 VALUES ('91000000-0000-4000-8000-000000000001','qa_text','QA texte','text',true,'v5-02b-qa'),
 ('91000000-0000-4000-8000-000000000002','qa_bool','QA bool','boolean',true,'v5-02b-qa'),
 ('91000000-0000-4000-8000-000000000003','qa_select','QA select','select',true,'v5-02b-qa'),
 ('91000000-0000-4000-8000-000000000005','qa_number','QA number','number',true,'v5-02b-qa'),
 ('91000000-0000-4000-8000-000000000006','qa_date','QA date','date',true,'v5-02b-qa');
INSERT INTO public.category_attribute_definitions(id,key,label_fr,type,required,category_id)
 VALUES ('91000000-0000-4000-8000-000000000004','qa_text','QA override','text',false,910003);
INSERT INTO public.category_attribute_options(id,attribute_definition_id,value,label_fr)
 VALUES ('92000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000003','ok','OK'),
 ('92000000-0000-4000-8000-000000000002','91000000-0000-4000-8000-000000000001','wrong','Wrong definition');
INSERT INTO storage.buckets(id,name,public) VALUES('listing-images','listing-images',false) ON CONFLICT DO NOTHING;
INSERT INTO public.email_attribution_sessions(user_id,campaign_id,occurrence_key,expires_at)
 VALUES('10000000-0000-4000-8000-000000000001','first_listing_h24','v5-02b-qa',now()+interval '1 hour');
WITH l AS (
 INSERT INTO public.listings(user_id,title,description,price,city,category_id,status,publication_managed)
 VALUES ('10000000-0000-4000-8000-000000000001','Annonce prête','Description complète pour publication.',1000,'Douala',910002,'draft',true)
 RETURNING id,user_id
) INSERT INTO qa_ids SELECT id,user_id FROM l;
INSERT INTO public.listing_attribute_values(listing_id,attribute_definition_id,value_text)
 SELECT id,'91000000-0000-4000-8000-000000000001','valeur' FROM qa_ids;
INSERT INTO public.listing_attribute_values(listing_id,attribute_definition_id,value_boolean)
 SELECT id,'91000000-0000-4000-8000-000000000002',false FROM qa_ids;
INSERT INTO public.listing_attribute_values(listing_id,attribute_definition_id,option_id)
 SELECT id,'91000000-0000-4000-8000-000000000003','92000000-0000-4000-8000-000000000001' FROM qa_ids;
INSERT INTO public.listing_attribute_values(listing_id,attribute_definition_id,value_number)
 SELECT id,'91000000-0000-4000-8000-000000000005',42 FROM qa_ids;
INSERT INTO public.listing_attribute_values(listing_id,attribute_definition_id,value_date)
 SELECT id,'91000000-0000-4000-8000-000000000006','2026-11-01' FROM qa_ids;
INSERT INTO storage.objects(bucket_id,name,owner_id,metadata)
 SELECT 'listing-images',owner_id::text||'/'||id::text||'/0.jpg',owner_id::text,'{"size":100}' FROM qa_ids;
INSERT INTO public.listing_images(listing_id,url,sort_order)
 SELECT id,owner_id::text||'/'||id::text||'/0.jpg',0 FROM qa_ids;
SELECT pg_temp.qa_assert((SELECT status='pending' FROM public.email_attribution_sessions WHERE occurrence_key='v5-02b-qa'),'private preparation does not convert attribution');
CREATE TEMP TABLE qa_effects(id uuid);
GRANT INSERT,SELECT ON qa_effects TO authenticated;
CREATE FUNCTION pg_temp.qa_publication_effect() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF current_setting('v5_02b.fail_effect',true)='on' THEN RAISE EXCEPTION 'qa_effect_failure'; END IF;
 INSERT INTO pg_temp.qa_effects VALUES(NEW.id); RETURN NEW;
END $$;
CREATE TRIGGER zz_qa_publication_effect AFTER UPDATE OF status ON public.listings
 FOR EACH ROW WHEN(OLD.status='draft' AND NEW.status='active')
 EXECUTE FUNCTION pg_temp.qa_publication_effect();
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
SELECT pg_temp.qa_assert(current_user='authenticated' AND NOT (SELECT rolbypassrls OR rolsuper FROM pg_roles WHERE rolname=current_user),'real nonprivileged owner role');
DO $$ DECLARE item text; rejected boolean; target uuid; BEGIN
 SELECT id INTO target FROM pg_temp.qa_ids;
 FOREACH item IN ARRAY ARRAY['short_title','long_title','short_description','long_description','zero_price','negative_price',
  'empty_city','multi_city','long_city','null_category','parent_category','no_photo','missing_storage','empty_storage',
  'missing_attribute','wrong_attribute_type','wrong_option','nonfinite_number','wrong_date','too_many_photos','downgrade','initial_active'] LOOP
  BEGIN
   CASE item
    WHEN 'short_title' THEN UPDATE public.listings SET title='ab' WHERE id=target;
    WHEN 'long_title' THEN UPDATE public.listings SET title=repeat('a',81) WHERE id=target;
    WHEN 'short_description' THEN UPDATE public.listings SET description='' WHERE id=target;
    WHEN 'long_description' THEN UPDATE public.listings SET description=repeat('a',2001) WHERE id=target;
    WHEN 'zero_price' THEN UPDATE public.listings SET price=0 WHERE id=target;
    WHEN 'negative_price' THEN UPDATE public.listings SET price=-1 WHERE id=target;
    WHEN 'empty_city' THEN UPDATE public.listings SET city='' WHERE id=target;
    WHEN 'multi_city' THEN UPDATE public.listings SET city='Douala/Yaoundé' WHERE id=target;
    WHEN 'long_city' THEN UPDATE public.listings SET city=repeat('a',21) WHERE id=target;
    WHEN 'null_category' THEN UPDATE public.listings SET category_id=NULL WHERE id=target;
    WHEN 'parent_category' THEN UPDATE public.listings SET category_id=910001 WHERE id=target;
    WHEN 'no_photo' THEN DELETE FROM public.listing_images WHERE listing_id=target;
    WHEN 'missing_storage' THEN UPDATE public.listing_images SET url=auth.uid()::text||'/'||target::text||'/missing.jpg' WHERE listing_id=target;
    WHEN 'empty_storage' THEN UPDATE storage.objects SET metadata='{"size":0}' WHERE name LIKE '%'||target::text||'%';
    WHEN 'missing_attribute' THEN DELETE FROM public.listing_attribute_values WHERE listing_id=target AND attribute_definition_id='91000000-0000-4000-8000-000000000001';
    WHEN 'wrong_attribute_type' THEN UPDATE public.listing_attribute_values SET value_text=NULL,value_boolean=true WHERE listing_id=target AND attribute_definition_id='91000000-0000-4000-8000-000000000001';
    WHEN 'wrong_option' THEN UPDATE public.listing_attribute_values SET option_id='92000000-0000-4000-8000-000000000002' WHERE listing_id=target AND attribute_definition_id='91000000-0000-4000-8000-000000000003';
    WHEN 'nonfinite_number' THEN UPDATE public.listing_attribute_values SET value_number='NaN' WHERE listing_id=target AND attribute_definition_id='91000000-0000-4000-8000-000000000005';
    WHEN 'wrong_date' THEN UPDATE public.listing_attribute_values SET value_date=NULL,value_text='invalid' WHERE listing_id=target AND attribute_definition_id='91000000-0000-4000-8000-000000000006';
    WHEN 'too_many_photos' THEN INSERT INTO public.listing_images(listing_id,url,sort_order) SELECT target,'missing-'||n,n FROM generate_series(1,4) n;
    ELSE NULL;
   END CASE;
   rejected:=false;
   BEGIN
    IF item='downgrade' THEN UPDATE public.listings SET publication_managed=false,status='active' WHERE id=target;
    ELSIF item='initial_active' THEN
     INSERT INTO public.listings(user_id,title,description,price,city,status,publication_managed)
      VALUES(auth.uid(),'invalid','',1,'Douala','active',true);
    ELSE PERFORM public.finalize_listing_publication(target); END IF;
   EXCEPTION WHEN check_violation THEN rejected:=true;
   END;
   IF NOT rejected THEN RAISE EXCEPTION 'FAIL invalid finalization %',item; END IF;
   -- Verify the same rules apply to direct table updates, not just the RPC.
   IF item NOT IN ('downgrade','initial_active') THEN
    rejected:=false;
    BEGIN UPDATE public.listings SET status='active' WHERE id=target;
    EXCEPTION WHEN check_violation THEN rejected:=true; END;
    IF NOT rejected THEN RAISE EXCEPTION 'FAIL direct UPDATE bypass %',item; END IF;
   END IF;
   IF (SELECT status FROM public.listings WHERE id=target)<>'draft'
      OR (SELECT publication_finalized_at FROM public.listings WHERE id=target) IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL failed finalization mutated draft %',item; END IF;
   RAISE SQLSTATE 'Z0001';
  EXCEPTION WHEN SQLSTATE 'Z0001' THEN NULL;
  END;
  PERFORM pg_temp.qa_assert(true,'reject + rollback + direct-write guard: '||item);
 END LOOP;
END $$;
-- Category-scoped definitions override profile definitions without stale requirements.
DO $$ DECLARE result record; BEGIN
 BEGIN
  UPDATE public.listings SET category_id=910003 WHERE id=(SELECT id FROM pg_temp.qa_ids);
  SELECT * INTO result FROM public.finalize_listing_publication((SELECT id FROM pg_temp.qa_ids));
  IF result.status<>'active' THEN RAISE EXCEPTION 'FAIL category override'; END IF;
  RAISE SQLSTATE 'Z0001';
 EXCEPTION WHEN SQLSTATE 'Z0001' THEN NULL; END;
 PERFORM pg_temp.qa_assert(true,'category override replaces profile requirement');
END $$;
-- A forged receipt is ignored, then a post-publication failure rolls back all effects.
UPDATE public.listings SET publication_finalized_at='2099-01-01' WHERE id=(SELECT id FROM qa_ids);
SELECT pg_temp.qa_assert((SELECT publication_finalized_at IS NULL FROM public.listings WHERE id=(SELECT id FROM qa_ids)),'cannot forge receipt');
SELECT set_config('v5_02b.fail_effect','on',true);
DO $$ BEGIN
 BEGIN
  PERFORM public.finalize_listing_publication((SELECT id FROM pg_temp.qa_ids));
  RAISE EXCEPTION 'FAIL expected effect failure';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'qa_effect_failure' THEN RAISE; END IF; END;
 PERFORM pg_temp.qa_assert((SELECT status='draft' AND publication_finalized_at IS NULL FROM public.listings WHERE id=(SELECT id FROM pg_temp.qa_ids)),'effect failure rolls back publication');
 PERFORM pg_temp.qa_assert((SELECT count(*)=0 FROM pg_temp.qa_effects),'effect failure rolls back ledger');
END $$;
RESET ROLE;
SELECT pg_temp.qa_assert((SELECT status='pending' AND converted_at IS NULL FROM public.email_attribution_sessions WHERE occurrence_key='v5-02b-qa'),'failed publication leaves attribution pending');
SET LOCAL ROLE authenticated;
SELECT set_config('v5_02b.fail_effect','off',true);
SELECT pg_temp.qa_assert(NOT already_published AND status='active','valid finalization, boolean false accepted') FROM public.finalize_listing_publication((SELECT id FROM qa_ids));
SELECT pg_temp.qa_assert(already_published AND status='active','idempotent retry') FROM public.finalize_listing_publication((SELECT id FROM qa_ids));
SELECT pg_temp.qa_assert(already_published,'prepare recovers lost finalization response') FROM public.prepare_listing_publication((SELECT id FROM qa_ids));
SELECT pg_temp.qa_assert((SELECT count(*)=1 FROM qa_effects),'exactly one publication effect');
SELECT pg_temp.qa_assert((SELECT publication_finalized_at=now() AND renewed_at IS NULL AND last_published_at=created_at FROM public.listings WHERE id=(SELECT id FROM qa_ids)),'server receipt, unchanged creation/ranking/renewal');
RESET ROLE;
SELECT pg_temp.qa_assert((SELECT status='converted' AND converted_at=now() FROM public.email_attribution_sessions WHERE occurrence_key='v5-02b-qa'),'attribution converts only on successful finalization');
SET LOCAL ROLE authenticated;
-- A legacy draft may join the new protocol without changing its id or creation.
DO $$ DECLARE l public.listings; prepared record; BEGIN
 INSERT INTO public.listings(user_id,title,description,price,city,status)
 VALUES(auth.uid(),'Ancien brouillon','',0,'','draft') RETURNING * INTO l;
 SELECT * INTO prepared FROM public.prepare_listing_publication(l.id);
 PERFORM pg_temp.qa_assert(prepared.id=l.id AND NOT prepared.already_published
  AND (SELECT publication_managed AND status='draft' AND created_at=l.created_at
   FROM public.listings WHERE id=l.id),'legacy draft enrolls privately with same id and created_at');
END $$;
-- Legacy 4.7.x is deliberately not subjected to the opt-in validation contract.
INSERT INTO public.listings(user_id,title,description,price,city,status)
 VALUES(auth.uid(),'ab','',0,'','active');
UPDATE public.listings SET description='' WHERE user_id=auth.uid() AND NOT publication_managed;
SELECT pg_temp.qa_assert(EXISTS(SELECT 1 FROM public.listings WHERE user_id=auth.uid() AND NOT publication_managed AND status='active'),'legacy active insert and incomplete edit preserved');
SELECT set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
DO $$ BEGIN
 BEGIN
  PERFORM public.finalize_listing_publication((SELECT id FROM pg_temp.qa_ids));
  RAISE EXCEPTION 'FAIL cross-owner accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM pg_temp.qa_assert(true,'cross-owner finalization denied');
END $$;
RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims','{}',true);
DO $$ BEGIN
 BEGIN
  PERFORM public.finalize_listing_publication((SELECT id FROM pg_temp.qa_ids));
  RAISE EXCEPTION 'FAIL anon accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM pg_temp.qa_assert(true,'anonymous finalization denied');
END $$;
RESET ROLE;
SELECT 'PASS' AS verdict,count(*) AS assertions FROM qa_results;
TABLE qa_results;
ROLLBACK;
