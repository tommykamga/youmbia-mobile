-- V5-02B: opt-in validated protocol. Legacy 4.7.x writes remain unchanged.
-- Local only. No ranking/timestamp semantic change, no campaign/Cron change.
BEGIN;
ALTER TABLE public.listings ADD COLUMN publication_managed boolean NOT NULL DEFAULT false;
ALTER TABLE public.listings ADD COLUMN publication_finalized_at timestamptz;

CREATE FUNCTION public.assert_listing_publication_ready(p public.listings)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
 c public.categories; d record; v public.listing_attribute_values;
 profile text; photo_count integer;
BEGIN
 IF char_length(btrim(p.title)) NOT BETWEEN 5 AND 80 THEN
  RAISE EXCEPTION 'Titre requis : 5 à 80 caractères' USING ERRCODE='23514'; END IF;
 IF char_length(btrim(p.description)) NOT BETWEEN 20 AND 2000 THEN
  RAISE EXCEPTION 'Description requise : 20 à 2000 caractères' USING ERRCODE='23514'; END IF;
 -- Current publication contract has no price-exempt category. Do not invent exemptions.
 IF p.price IS NULL OR p.price <= 0 THEN
  RAISE EXCEPTION 'Prix requis : supérieur à zéro' USING ERRCODE='23514'; END IF;
 IF char_length(btrim(p.city)) NOT BETWEEN 2 AND 20 OR p.city ~ '[,/;|\-]' THEN
  RAISE EXCEPTION 'Ville requise : indiquez une seule ville' USING ERRCODE='23514'; END IF;
 SELECT * INTO c FROM public.categories WHERE id=p.category_id;
 IF NOT FOUND OR EXISTS(SELECT 1 FROM public.categories WHERE parent_id=c.id) THEN
  RAISE EXCEPTION 'Choisissez une catégorie finale ou une sous-catégorie' USING ERRCODE='23514'; END IF;
 profile := NULLIF(btrim(c.form_profile),'');
 IF profile IS NULL AND c.slug IN ('electronique','telephones-objets-connectes',
   'accessoires-telephone','informatique','tv-audio') THEN profile:='electronics'; END IF;
 SELECT count(*) INTO photo_count FROM public.listing_images WHERE listing_id=p.id;
 IF photo_count NOT BETWEEN 1 AND 4 THEN
  RAISE EXCEPTION 'Ajoutez entre 1 et 4 photos persistées' USING ERRCODE='23514'; END IF;
 IF EXISTS (
  SELECT 1 FROM public.listing_images i WHERE i.listing_id=p.id AND NOT EXISTS (
   SELECT 1 FROM storage.objects o WHERE o.bucket_id='listing-images' AND o.name=i.url
    AND split_part(o.name,'/',1)=p.user_id::text
    AND split_part(o.name,'/',2)=p.id::text
    AND COALESCE(o.metadata->>'size','0') ~ '^[1-9][0-9]*$'
    AND NOT COALESCE(o.is_delete_marker,false)
  )
 ) THEN RAISE EXCEPTION 'Certaines photos ne sont pas encore persistées' USING ERRCODE='23514'; END IF;
 FOR d IN
  SELECT DISTINCT ON (key) * FROM public.category_attribute_definitions
  WHERE category_id=c.id OR (category_id IS NULL AND form_profile=profile)
  ORDER BY key, (category_id IS NOT NULL) DESC, id
 LOOP
  SELECT * INTO v FROM public.listing_attribute_values
   WHERE listing_id=p.id AND attribute_definition_id=d.id;
  IF NOT FOUND THEN
   IF d.required THEN RAISE EXCEPTION 'Caractéristique obligatoire : %', d.label_fr USING ERRCODE='23514'; END IF;
   CONTINUE;
  END IF;
  IF num_nonnulls(v.option_id,v.value_text,v.value_number,v.value_boolean,v.value_date)<>1
   OR NOT (CASE d.type
    WHEN 'text' THEN COALESCE(char_length(btrim(v.value_text))>0,false)
    WHEN 'number' THEN v.value_number IS NOT NULL AND v.value_number::text NOT IN ('NaN','Infinity','-Infinity')
    WHEN 'boolean' THEN v.value_boolean IS NOT NULL
    WHEN 'date' THEN v.value_date IS NOT NULL
    WHEN 'select' THEN EXISTS(SELECT 1 FROM public.category_attribute_options
      WHERE id=v.option_id AND attribute_definition_id=d.id)
    ELSE false END) THEN
   RAISE EXCEPTION 'Caractéristique invalide : %',d.label_fr USING ERRCODE='23514';
  END IF;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.assert_listing_publication_ready(public.listings) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_listing_publication_ready(public.listings) TO authenticated, service_role;

CREATE FUNCTION public.guard_listing_publication_protocol()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  NEW.publication_finalized_at:=NULL;
  IF NEW.publication_managed AND NEW.status<>'draft' THEN
   RAISE EXCEPTION 'La préparation doit rester en brouillon' USING ERRCODE='23514'; END IF;
 ELSE
  NEW.publication_finalized_at:=OLD.publication_finalized_at;
  IF OLD.publication_managed AND NOT NEW.publication_managed THEN
   RAISE EXCEPTION 'Le protocole de publication ne peut pas être désactivé' USING ERRCODE='23514'; END IF;
  IF NOT OLD.publication_managed AND NEW.publication_managed AND OLD.status<>'draft' THEN
   RAISE EXCEPTION 'Seul un brouillon peut rejoindre la finalisation' USING ERRCODE='23514'; END IF;
  IF NEW.publication_managed AND OLD.status='draft' AND NEW.status='active' THEN
   PERFORM public.assert_listing_publication_ready(NEW);
   NEW.publication_finalized_at:=pg_catalog.now();
  END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_listing_publication_protocol() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER listings_guard_publication_protocol BEFORE INSERT OR UPDATE ON public.listings
 FOR EACH ROW EXECUTE FUNCTION public.guard_listing_publication_protocol();

-- Serialize preparation metadata writes with finalization, using the same parent lock.
CREATE FUNCTION public.lock_listing_publication_parent()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  PERFORM 1 FROM public.listings WHERE id=NEW.listing_id AND publication_managed FOR UPDATE;
 ELSIF TG_OP='DELETE' THEN
  PERFORM 1 FROM public.listings WHERE id=OLD.listing_id AND publication_managed FOR UPDATE;
 ELSE
  PERFORM 1 FROM public.listings WHERE id IN (OLD.listing_id,NEW.listing_id)
   AND publication_managed ORDER BY id FOR UPDATE;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
REVOKE ALL ON FUNCTION public.lock_listing_publication_parent() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER listing_images_lock_publication BEFORE INSERT OR UPDATE OR DELETE ON public.listing_images
 FOR EACH ROW EXECUTE FUNCTION public.lock_listing_publication_parent();
CREATE TRIGGER listing_attributes_lock_publication BEFORE INSERT OR UPDATE OR DELETE ON public.listing_attribute_values
 FOR EACH ROW EXECUTE FUNCTION public.lock_listing_publication_parent();

CREATE FUNCTION public.prepare_listing_publication(p_listing_id uuid)
RETURNS TABLE(id uuid,status public.listing_status,already_published boolean)
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE l public.listings;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Connexion requise' USING ERRCODE='42501'; END IF;
 SELECT * INTO l FROM public.listings WHERE listings.id=p_listing_id AND user_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Annonce introuvable ou non autorisée' USING ERRCODE='42501'; END IF;
 IF l.publication_managed AND l.publication_finalized_at IS NOT NULL AND l.status='active' THEN
  RETURN QUERY SELECT l.id,l.status,true; RETURN;
 END IF;
 IF l.status<>'draft' THEN RAISE EXCEPTION 'Cette annonce ne peut pas être préparée' USING ERRCODE='23514'; END IF;
 UPDATE public.listings SET publication_managed=true WHERE listings.id=l.id;
 RETURN QUERY SELECT l.id,l.status,false;
END $$;

CREATE FUNCTION public.finalize_listing_publication(p_listing_id uuid)
RETURNS TABLE(id uuid,status public.listing_status,already_published boolean)
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE l public.listings;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Connexion requise' USING ERRCODE='42501'; END IF;
 SELECT * INTO l FROM public.listings WHERE listings.id=p_listing_id AND user_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Annonce introuvable ou non autorisée' USING ERRCODE='42501'; END IF;
 IF l.publication_managed AND l.publication_finalized_at IS NOT NULL AND l.status='active' THEN
  RETURN QUERY SELECT l.id,l.status,true; RETURN;
 END IF;
 IF NOT l.publication_managed OR l.status<>'draft' THEN
  RAISE EXCEPTION 'Préparez le brouillon avant de finaliser' USING ERRCODE='23514'; END IF;
 -- The row trigger validates even a direct Supabase UPDATE: no RPC-only trust.
 -- Existing AFTER triggers execute in this transaction; failure rolls everything back.
 UPDATE public.listings SET status='active' WHERE listings.id=l.id;
 RETURN QUERY SELECT l.id,'active'::public.listing_status,false;
END $$;
REVOKE ALL ON FUNCTION public.prepare_listing_publication(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.finalize_listing_publication(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.prepare_listing_publication(uuid), public.finalize_listing_publication(uuid) TO authenticated;
-- The existing attribution trigger treats a generated publication date on INSERT
-- as conversion. Preserve its legacy behavior, but keep managed drafts unconverted
-- until their actual transition. No campaign, flag, consent or Cron is changed.
DROP TRIGGER trg_lifecycle_attribution_on_publish ON public.listings;
CREATE TRIGGER trg_lifecycle_attribution_on_publish
 AFTER INSERT OR UPDATE OF last_published_at,status ON public.listings
 FOR EACH ROW WHEN(NEW.last_published_at IS NOT NULL AND NOT NEW.publication_managed)
 EXECUTE FUNCTION public.close_lifecycle_attribution_on_publish();
CREATE OR REPLACE FUNCTION public.close_managed_listing_attribution_on_publish()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT NEW.publication_managed OR OLD.status<>'draft' OR NEW.status<>'active' THEN RETURN NEW; END IF;

  UPDATE public.email_attribution_sessions AS s
  SET
    status = 'converted',
    converted_at = pg_catalog.now(),
    conversion_event = CASE
      WHEN s.campaign_id = 'abandoned_draft_h24'
           AND s.occurrence_key = NEW.id::text THEN 'draft_published'
      ELSE 'listing_published'
    END
  WHERE s.user_id = NEW.user_id
    AND s.status = 'pending'
    AND s.expires_at >= pg_catalog.now()
    AND (
      s.campaign_id IN ('welcome_h0', 'first_listing_h24')
      OR (
        s.campaign_id = 'abandoned_draft_h24'
        AND s.occurrence_key = NEW.id::text
      )
    );

  RETURN NEW;
END;
$function$
;
REVOKE ALL ON FUNCTION public.close_managed_listing_attribution_on_publish() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER trg_managed_listing_attribution_on_publish AFTER UPDATE OF status ON public.listings
 FOR EACH ROW WHEN(OLD.status='draft' AND NEW.status='active' AND NEW.publication_managed)
 EXECUTE FUNCTION public.close_managed_listing_attribution_on_publish();
COMMIT;
