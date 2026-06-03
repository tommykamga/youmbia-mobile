-- RPC sécurisée de marquage "lu" des messages internes (variante A recommandée).
-- Objectif: marquer read_at = now() sur les messages REÇUS et non lus d'une conversation,
-- sans exposer de policy UPDATE directe sur public.messages.
--
-- Garanties:
-- - SECURITY DEFINER: l'UPDATE ne passe pas par une policy UPDATE côté client.
-- - Ne modifie QUE read_at (jamais body, sender_id, conversation_id, created_at).
-- - Ne marque que les messages dont sender_id <> auth.uid() (jamais ses propres messages).
-- - N'agit que si auth.uid() est participant (buyer_id ou seller_id) de la conversation.
-- - Idempotent (filtre read_at IS NULL).

CREATE OR REPLACE FUNCTION public.mark_conversation_read(p_conversation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  -- L'appelant doit être participant de la conversation.
  IF NOT EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = p_conversation_id
      AND v_uid IN (c.buyer_id, c.seller_id)
  ) THEN
    RAISE EXCEPTION 'not a participant of this conversation';
  END IF;

  -- Ne marque que les messages REÇUS et encore non lus (seul read_at est modifié).
  UPDATE public.messages
  SET read_at = now()
  WHERE conversation_id = p_conversation_id
    AND sender_id <> v_uid
    AND read_at IS NULL;
END;
$$;

-- Seuls les utilisateurs authentifiés peuvent l'appeler.
REVOKE ALL ON FUNCTION public.mark_conversation_read(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.mark_conversation_read(uuid) TO authenticated;
