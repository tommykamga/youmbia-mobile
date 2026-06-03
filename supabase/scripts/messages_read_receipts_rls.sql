-- PROPOSITION — NE PAS APPLIQUER SANS VALIDATION.
-- Sécurise le marquage "lu" des messages internes (read_at) sans ouvrir un UPDATE large.
--
-- Contexte : le client (markConversationRead.ts) exécute aujourd'hui :
--   UPDATE public.messages SET read_at = now()
--   WHERE conversation_id = :id AND sender_id <> auth.uid() AND read_at IS NULL;
-- Pour que cet UPDATE soit autorisé, une policy UPDATE est nécessaire.
--
-- ⚠️ RISQUE de l'approche "policy UPDATE directe" (variante B ci-dessous) :
-- une policy FOR UPDATE autorise la modification de N'IMPORTE QUELLE colonne de la
-- ligne (body, created_at, ...), pas seulement read_at. RLS ne peut pas restreindre
-- les colonnes ; seul un GRANT au niveau colonne ou une fonction le peut.
-- => On RECOMMANDE la variante A (RPC SECURITY DEFINER) qui ne touche que read_at.

-- ============================================================================
-- VARIANTE A (RECOMMANDÉE) : RPC sécurisée, ne modifie que read_at
-- ============================================================================
-- Aucune policy UPDATE n'est exposée aux clients ; la fonction valide elle-même
-- que l'appelant est participant et ne marque que les messages reçus.
CREATE OR REPLACE FUNCTION public.mark_conversation_read(p_conversation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- L'appelant doit être participant de la conversation.
  IF NOT EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = p_conversation_id
      AND auth.uid() IN (c.buyer_id, c.seller_id)
  ) THEN
    RAISE EXCEPTION 'not a participant of this conversation';
  END IF;

  -- Ne marque que les messages REÇUS et encore non lus (seul read_at est modifié).
  UPDATE public.messages
  SET read_at = now()
  WHERE conversation_id = p_conversation_id
    AND sender_id <> auth.uid()
    AND read_at IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_conversation_read(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.mark_conversation_read(uuid) TO authenticated;

-- Côté client (à activer SEULEMENT après application de cette variante) :
--   await supabase.rpc('mark_conversation_read', { p_conversation_id: conversationId });
-- Remplacerait le .update() direct dans markConversationRead.ts.

-- ============================================================================
-- VARIANTE B (ALTERNATIVE, moins stricte) : policy UPDATE directe
-- ============================================================================
-- À n'utiliser que si l'on conserve le .update() direct côté client.
-- ⚠️ Voir le risque "toutes colonnes" ci-dessus. Compléter idéalement par :
--   REVOKE UPDATE ON public.messages FROM authenticated;
--   GRANT  UPDATE (read_at) ON public.messages TO authenticated;
-- afin de limiter l'UPDATE à la seule colonne read_at au niveau privilèges.
--
-- CREATE POLICY "Participants can mark received messages as read"
-- ON public.messages
-- FOR UPDATE
-- TO authenticated
-- USING (
--   EXISTS (
--     SELECT 1
--     FROM public.conversations c
--     WHERE c.id = messages.conversation_id
--       AND auth.uid() IN (c.buyer_id, c.seller_id)
--   )
-- )
-- WITH CHECK (
--   sender_id <> auth.uid()
-- );
