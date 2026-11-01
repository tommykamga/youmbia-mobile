BEGIN;
ALTER TABLE public.listings ADD COLUMN first_published_at timestamptz;
CREATE TABLE public.listing_first_publications (
 listing_id uuid PRIMARY KEY, user_id uuid NOT NULL, published_at timestamptz NOT NULL
);
CREATE INDEX ON public.listing_first_publications(user_id,published_at);
ALTER TABLE public.listing_first_publications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.listing_first_publications FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.listing_first_publications TO authenticated;
CREATE POLICY publication_fact_owner_read ON public.listing_first_publications
 FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()));
CREATE FUNCTION public.record_listing_first_publication()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE first_event boolean; stamp timestamptz;
BEGIN
 IF TG_OP='INSERT' THEN
  NEW.first_published_at:=NULL; first_event:=NEW.status='active';
 ELSE
  NEW.first_published_at:=OLD.first_published_at;
  first_event:=OLD.status='draft' AND NEW.status='active';
 END IF;
 IF NOT first_event THEN RETURN NEW; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(NEW.user_id::text,50203));
 SELECT published_at INTO stamp FROM public.listing_first_publications WHERE listing_id=NEW.id;
 IF FOUND THEN NEW.first_published_at:=stamp; RETURN NEW; END IF;
 stamp:=pg_catalog.clock_timestamp();
 IF (SELECT count(*) FROM public.listing_first_publications
     WHERE user_id=NEW.user_id AND published_at>stamp-interval '24 hours')>=100 THEN
  RAISE EXCEPTION 'Limite de 100 premières publications sur 24 heures' USING ERRCODE='23514';
 END IF;
 INSERT INTO public.listing_first_publications VALUES(NEW.id,NEW.user_id,stamp);
 NEW.first_published_at:=stamp;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.record_listing_first_publication() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER listings_record_first_publication BEFORE INSERT OR UPDATE ON public.listings
 FOR EACH ROW EXECUTE FUNCTION public.record_listing_first_publication();
-- No backfill: historical first-publication dates remain unknown. No ranking change.
COMMIT;
