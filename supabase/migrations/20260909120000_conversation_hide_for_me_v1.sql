-- TOM-98 / messagerie — « Supprimer pour moi » (soft-hide par participant).
-- Modèle existant : conversations.buyer_id / seller_id (pas de conversation_participants).
-- Aucun hard-delete de messages. TOM-102 (conversation_reports) inchangé.

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS buyer_deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS seller_deleted_at timestamptz;

COMMENT ON COLUMN public.conversations.buyer_deleted_at IS
  'Hide-for-me côté acheteur : conversation absente de son inbox tant que non NULL.';
COMMENT ON COLUMN public.conversations.seller_deleted_at IS
  'Hide-for-me côté vendeur : conversation absente de son inbox tant que non NULL.';

-- Masque la conversation pour l'appelant uniquement + marque ses messages reçus comme lus
-- (badge unread). Idempotent. Ne peut pas masquer pour l'autre participant.
CREATE OR REPLACE FUNCTION public.hide_conversation_for_me(p_conversation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_buyer uuid;
  v_seller uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT c.buyer_id, c.seller_id
  INTO v_buyer, v_seller
  FROM public.conversations c
  WHERE c.id = p_conversation_id;

  IF v_buyer IS NULL THEN
    RAISE EXCEPTION 'conversation not found';
  END IF;

  IF v_uid IS DISTINCT FROM v_buyer AND v_uid IS DISTINCT FROM v_seller THEN
    RAISE EXCEPTION 'not a participant of this conversation';
  END IF;

  -- Marquer lus les messages reçus (évite badge fantôme après hide).
  UPDATE public.messages
  SET read_at = now()
  WHERE conversation_id = p_conversation_id
    AND sender_id <> v_uid
    AND read_at IS NULL;

  IF v_uid = v_buyer THEN
    UPDATE public.conversations
    SET
      buyer_deleted_at = COALESCE(buyer_deleted_at, now()),
      buyer_unread_count = 0
    WHERE id = p_conversation_id;
  ELSE
    UPDATE public.conversations
    SET
      seller_deleted_at = COALESCE(seller_deleted_at, now()),
      seller_unread_count = 0
    WHERE id = p_conversation_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.hide_conversation_for_me(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.hide_conversation_for_me(uuid) TO authenticated;

-- Nouveau message => réapparition inbox UNIQUEMENT chez le destinataire.
-- Expéditeur masqué qui renvoie : son propre *_deleted_at reste inchangé.
CREATE OR REPLACE FUNCTION public.conversations_undelete_on_new_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_buyer uuid;
  v_seller uuid;
BEGIN
  SELECT c.buyer_id, c.seller_id
  INTO v_buyer, v_seller
  FROM public.conversations c
  WHERE c.id = NEW.conversation_id;

  IF v_buyer IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.sender_id = v_buyer THEN
    -- Acheteur envoie => seul le vendeur réapparaît dans son inbox.
    UPDATE public.conversations
    SET seller_deleted_at = NULL
    WHERE id = NEW.conversation_id
      AND seller_deleted_at IS NOT NULL;
  ELSIF NEW.sender_id = v_seller THEN
    -- Vendeur envoie => seul l'acheteur réapparaît dans son inbox.
    UPDATE public.conversations
    SET buyer_deleted_at = NULL
    WHERE id = NEW.conversation_id
      AND buyer_deleted_at IS NOT NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_conversations_undelete_on_new_message ON public.messages;
CREATE TRIGGER trg_conversations_undelete_on_new_message
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.conversations_undelete_on_new_message();
