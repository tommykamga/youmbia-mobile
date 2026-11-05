-- V5-04 additive; QA only until release GO. No marketing, cron or notification changes.
BEGIN;
CREATE SCHEMA IF NOT EXISTS v5_marketplace_private;
REVOKE ALL ON SCHEMA v5_marketplace_private FROM PUBLIC;
GRANT USAGE ON SCHEMA v5_marketplace_private TO anon, authenticated;

CREATE TABLE public.marketplace_contact_intents (
 event_id uuid PRIMARY KEY,
 actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
 channel text NOT NULL CHECK(channel IN ('message','whatsapp','call','sms')),
 platform text NOT NULL CHECK(platform IN ('ios','android','web')),
 source text NOT NULL CHECK(source IN ('home','search','favorites','messages','shared','link','other')),
 entry_point text NOT NULL CHECK(entry_point IN ('listing_detail','auth_return')),
 session_key uuid NOT NULL,
 city text, category_id bigint,
 occurred_at timestamptz NOT NULL, received_at timestamptz NOT NULL,
 event_version integer NOT NULL DEFAULT 1 CHECK(event_version=1)
);
CREATE INDEX ON public.marketplace_contact_intents(actor_id,received_at);
CREATE INDEX ON public.marketplace_contact_intents(received_at);
ALTER TABLE public.marketplace_contact_intents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.marketplace_contact_intents FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.marketplace_contact_intents TO authenticated;
CREATE POLICY contact_intent_own_read ON public.marketplace_contact_intents FOR SELECT TO authenticated
 USING(actor_id=(SELECT auth.uid()));

CREATE FUNCTION v5_marketplace_private.record_contact(p_event_id uuid,p_listing_id uuid,p_channel text,p_platform text,p_source text,p_entry_point text,p_session_key uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE uid uuid:=auth.uid(); existing public.marketplace_contact_intents; l public.listings; stamp timestamptz;
BEGIN
 IF uid IS NULL OR COALESCE((auth.jwt()->>'is_anonymous')::boolean,false) THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 IF p_event_id IS NULL OR p_session_key IS NULL OR p_listing_id IS NULL OR p_channel IS NULL OR p_platform IS NULL OR p_source IS NULL OR p_entry_point IS NULL THEN RAISE EXCEPTION 'Missing contact fields' USING ERRCODE='22023'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(uid::text,504));
 SELECT * INTO existing FROM public.marketplace_contact_intents WHERE event_id=p_event_id;
 IF FOUND THEN
  IF existing.actor_id<>uid THEN RAISE EXCEPTION 'Event unavailable' USING ERRCODE='42501'; END IF;
  IF (existing.listing_id,existing.channel,existing.platform,existing.source,existing.entry_point,existing.session_key)
    IS DISTINCT FROM (p_listing_id,p_channel,p_platform,p_source,p_entry_point,p_session_key) THEN
   RAISE EXCEPTION 'Conflicting event replay' USING ERRCODE='22023'; END IF;
  RETURN existing.event_id;
 END IF;
 SELECT * INTO l FROM public.listings WHERE id=p_listing_id AND status='active';
 IF NOT FOUND OR l.user_id IS NULL OR l.user_id=uid THEN RAISE EXCEPTION 'Contact unavailable' USING ERRCODE='42501'; END IF;
 stamp:=pg_catalog.clock_timestamp();
 IF (SELECT count(*) FROM public.marketplace_contact_intents WHERE actor_id=uid AND received_at>stamp-interval '1 minute')>=60 THEN
  RAISE EXCEPTION 'Contact rate limit' USING ERRCODE='54000'; END IF;
 INSERT INTO public.marketplace_contact_intents(event_id,actor_id,listing_id,channel,platform,source,entry_point,session_key,city,category_id,occurred_at,received_at)
 VALUES(p_event_id,uid,l.id,p_channel,p_platform,p_source,p_entry_point,p_session_key,l.city,l.category_id,stamp,stamp);
 RETURN p_event_id;
END $$;
REVOKE ALL ON FUNCTION v5_marketplace_private.record_contact(uuid,uuid,text,text,text,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION v5_marketplace_private.record_contact(uuid,uuid,text,text,text,text,uuid) TO authenticated;
CREATE FUNCTION public.record_v5_contact_intent(p_event_id uuid,p_listing_id uuid,p_channel text,p_platform text,p_source text,p_entry_point text,p_session_key uuid)
RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT v5_marketplace_private.record_contact(p_event_id,p_listing_id,p_channel,p_platform,p_source,p_entry_point,p_session_key);
$$;
REVOKE ALL ON FUNCTION public.record_v5_contact_intent(uuid,uuid,text,text,text,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_v5_contact_intent(uuid,uuid,text,text,text,text,uuid) TO authenticated;

-- Retention: 30 days. Dedicated explicit maintenance, no cron installed or modified.
CREATE FUNCTION v5_marketplace_private.purge_contacts() RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE n bigint; BEGIN DELETE FROM public.marketplace_contact_intents WHERE received_at<pg_catalog.clock_timestamp()-interval '30 days'; GET DIAGNOSTICS n=ROW_COUNT; RETURN n; END $$;
REVOKE ALL ON FUNCTION v5_marketplace_private.purge_contacts() FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA v5_marketplace_private TO service_role;
GRANT EXECUTE ON FUNCTION v5_marketplace_private.purge_contacts() TO service_role;

-- Existing 4.7.x INSERT payloads remain valid. Never backfill historical messages.
ALTER TABLE public.messages ADD COLUMN server_received_at timestamptz;
ALTER TABLE public.messages ADD COLUMN server_context_key text;
CREATE FUNCTION v5_marketplace_private.stamp_message() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  NEW.server_received_at:=pg_catalog.clock_timestamp();
  SELECT pg_catalog.md5(c.listing_id::text||':'||c.buyer_id::text||':'||c.seller_id::text)
  INTO NEW.server_context_key FROM public.conversations c WHERE c.id=NEW.conversation_id;
 ELSE NEW.server_received_at:=OLD.server_received_at; NEW.server_context_key:=OLD.server_context_key; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION v5_marketplace_private.stamp_message() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER messages_v5_received BEFORE INSERT OR UPDATE ON public.messages FOR EACH ROW EXECUTE FUNCTION v5_marketplace_private.stamp_message();
CREATE INDEX ON public.messages(conversation_id,server_received_at) WHERE server_received_at IS NOT NULL;

CREATE FUNCTION v5_marketplace_private.response_metrics(p_seller_id uuid)
RETURNS TABLE(eligible_conversations bigint,responded_conversations bigint,unanswered_conversations bigint,excluded_legacy_conversations bigint,median_first_response_seconds double precision)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_admin() THEN RAISE EXCEPTION 'Admin required' USING ERRCODE='42501'; END IF;
 RETURN QUERY
 WITH base AS (
  SELECT c.id,c.buyer_id,c.seller_id,
   -- "legacy" counts any source context that cannot be certified, without changing old RLS writes.
   (NOT EXISTS(SELECT 1 FROM public.listings l WHERE l.id=c.listing_id AND l.user_id=c.seller_id)
    OR EXISTS(SELECT 1 FROM public.messages m WHERE m.conversation_id=c.id AND (m.server_received_at IS NULL
      OR m.server_context_key IS DISTINCT FROM pg_catalog.md5(c.listing_id::text||':'||c.buyer_id::text||':'||c.seller_id::text)))) AS legacy,
   (SELECT min(m.server_received_at) FROM public.messages m WHERE m.conversation_id=c.id AND m.sender_id=c.buyer_id AND length(btrim(m.body))>0) AS buyer_at
  FROM public.conversations c WHERE c.seller_id=p_seller_id AND c.buyer_id<>c.seller_id
 ), replies AS (
  SELECT b.*, (SELECT min(m.server_received_at) FROM public.messages m
   WHERE m.conversation_id=b.id AND m.sender_id=b.seller_id AND length(btrim(m.body))>0
   AND m.server_received_at>b.buyer_at) AS seller_at FROM base b
 )
 SELECT count(*) FILTER(WHERE NOT r.legacy AND r.buyer_at IS NOT NULL),
 count(*) FILTER(WHERE NOT r.legacy AND r.buyer_at IS NOT NULL AND r.seller_at IS NOT NULL),
 count(*) FILTER(WHERE NOT r.legacy AND r.buyer_at IS NOT NULL AND r.seller_at IS NULL),
 count(*) FILTER(WHERE r.legacy),
 percentile_cont(0.5) WITHIN GROUP(ORDER BY extract(epoch FROM r.seller_at-r.buyer_at)::double precision)
  FILTER(WHERE NOT r.legacy AND r.buyer_at IS NOT NULL AND r.seller_at IS NOT NULL)
 FROM replies r;
END $$;
REVOKE ALL ON FUNCTION v5_marketplace_private.response_metrics(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION v5_marketplace_private.response_metrics(uuid) TO authenticated;
CREATE FUNCTION public.get_v5_seller_response_metrics(p_seller_id uuid)
RETURNS TABLE(eligible_conversations bigint,responded_conversations bigint,unanswered_conversations bigint,excluded_legacy_conversations bigint,median_first_response_seconds double precision)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT * FROM v5_marketplace_private.response_metrics(p_seller_id); $$;
REVOKE ALL ON FUNCTION public.get_v5_seller_response_metrics(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_v5_seller_response_metrics(uuid) TO authenticated;

CREATE TABLE public.listing_availability_declarations (
 listing_id uuid PRIMARY KEY REFERENCES public.listings(id) ON DELETE CASCADE,
 state text NOT NULL CHECK(state IN ('available','unknown','sold')),
 confirmed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.listing_availability_declarations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.listing_availability_declarations FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.listing_availability_declarations TO anon,authenticated;
CREATE POLICY availability_visible ON public.listing_availability_declarations FOR SELECT TO anon,authenticated
 USING(EXISTS(SELECT 1 FROM public.listings l WHERE l.id=listing_id AND (l.status='active' OR l.user_id=(SELECT auth.uid()))));
CREATE FUNCTION v5_marketplace_private.declare_availability(p_listing_id uuid,p_state text,p_expected_status text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE l public.listings; BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 SELECT * INTO l FROM public.listings WHERE id=p_listing_id AND user_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Listing unavailable' USING ERRCODE='42501'; END IF;
 IF p_state IS NULL OR p_state NOT IN ('available','unknown','sold') OR p_expected_status IS NULL OR l.status::text<>p_expected_status THEN RAISE EXCEPTION 'Stale or invalid declaration' USING ERRCODE='22023'; END IF;
 IF l.status NOT IN ('active','hidden','sold') OR (p_state='available' AND l.status<>'active') THEN RAISE EXCEPTION 'Declaration unavailable for status' USING ERRCODE='42501'; END IF;
 IF p_state='sold' AND l.status<>'sold' THEN UPDATE public.listings SET status='sold' WHERE id=l.id AND status=l.status; END IF;
 INSERT INTO public.listing_availability_declarations(listing_id,state,confirmed_at) VALUES(l.id,p_state,pg_catalog.clock_timestamp())
 ON CONFLICT(listing_id) DO UPDATE SET state=EXCLUDED.state,confirmed_at=EXCLUDED.confirmed_at;
 RETURN p_state;
END $$;
REVOKE ALL ON FUNCTION v5_marketplace_private.declare_availability(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION v5_marketplace_private.declare_availability(uuid,text,text) TO authenticated;
CREATE FUNCTION public.declare_v5_listing_availability(p_listing_id uuid,p_state text,p_expected_status text)
RETURNS text LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT v5_marketplace_private.declare_availability(p_listing_id,p_state,p_expected_status); $$;
REVOKE ALL ON FUNCTION public.declare_v5_listing_availability(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.declare_v5_listing_availability(uuid,text,text) TO authenticated;
-- Any legacy status transition invalidates the previous declaration; no reactivation implied.
CREATE FUNCTION v5_marketplace_private.clear_availability() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN IF NEW.status IS DISTINCT FROM OLD.status THEN DELETE FROM public.listing_availability_declarations WHERE listing_id=NEW.id; END IF; RETURN NEW; END $$;
REVOKE ALL ON FUNCTION v5_marketplace_private.clear_availability() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER listings_v5_clear_availability AFTER UPDATE ON public.listings FOR EACH ROW EXECUTE FUNCTION v5_marketplace_private.clear_availability();

-- No historical bool is promoted to evidence. Real policy/proof records must be provisioned separately.
CREATE TABLE v5_marketplace_private.verification_evidence (
 subject_type text NOT NULL CHECK(subject_type IN ('profile','shop')),subject_id uuid NOT NULL,
 policy_version text NOT NULL CHECK(length(btrim(policy_version)) BETWEEN 1 AND 100),
 proof_reference text NOT NULL CHECK(length(btrim(proof_reference)) BETWEEN 1 AND 200),
 verified_at timestamptz NOT NULL DEFAULT clock_timestamp(),revoked_at timestamptz,
 PRIMARY KEY(subject_type,subject_id)
);
ALTER TABLE v5_marketplace_private.verification_evidence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON v5_marketplace_private.verification_evidence FROM PUBLIC,anon,authenticated;
GRANT ALL ON v5_marketplace_private.verification_evidence TO service_role;
CREATE FUNCTION v5_marketplace_private.verified_subject(p_subject_type text,p_subject_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM v5_marketplace_private.verification_evidence e WHERE e.subject_type=p_subject_type AND e.subject_id=p_subject_id AND e.revoked_at IS NULL AND e.verified_at<=pg_catalog.statement_timestamp());
$$;
REVOKE ALL ON FUNCTION v5_marketplace_private.verified_subject(text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION v5_marketplace_private.verified_subject(text,uuid) TO anon,authenticated;
CREATE FUNCTION public.is_v5_verified_subject(p_subject_type text,p_subject_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT v5_marketplace_private.verified_subject(p_subject_type,p_subject_id); $$;
REVOKE ALL ON FUNCTION public.is_v5_verified_subject(text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_v5_verified_subject(text,uuid) TO anon,authenticated;
CREATE FUNCTION public.get_v5_listing_availability(p_listing_id uuid)
RETURNS TABLE(state text,confirmed_at timestamptz) LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT CASE WHEN l.status='sold' THEN 'sold' ELSE COALESCE(d.state,'unknown') END,d.confirmed_at
 FROM public.listings l LEFT JOIN public.listing_availability_declarations d ON d.listing_id=l.id WHERE l.id=p_listing_id;
$$;
REVOKE ALL ON FUNCTION public.get_v5_listing_availability(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_v5_listing_availability(uuid) TO anon,authenticated;
-- Bounded receipts for existing shop rails; never one RPC per card.
CREATE FUNCTION public.get_v5_verified_subjects(p_subject_type text,p_subject_ids uuid[])
RETURNS TABLE(subject_id uuid,verification_proven boolean) LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT ids.id,v5_marketplace_private.verified_subject(p_subject_type,ids.id)
 FROM (SELECT DISTINCT unnest(p_subject_ids) AS id LIMIT 50) ids;
$$;
REVOKE ALL ON FUNCTION public.get_v5_verified_subjects(text,uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_v5_verified_subjects(text,uuid[]) TO anon,authenticated;
COMMIT;
