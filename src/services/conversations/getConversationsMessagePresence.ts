/**
 * Détermine quelles conversations ont au moins une ligne `messages` (preuve serveur),
 * sans déduire d'un aperçu ou compteur. Pagination bornée par lot pour éviter N+1 et silences.
 */

import { supabase } from '@/lib/supabase';

const CONV_ID_BATCH = 200;
/** Lignes max par requête PostgREST (évite résultats tronqués silencieux). */
export const MESSAGE_PRESENCE_ROW_PAGE = 1000;

export type MessagePresenceResult =
  | { ok: true; conversationIds: Set<string> }
  | { ok: false; errorMessage: string };

/**
 * Pour chaque id donné, vérifie qu'au moins un message existe (requêtes paginées par lot).
 * Pagination : si le filtre `.in(remaining)` change, l'offset repart à 0 ; sinon ordre stable + range suivant.
 */
export async function fetchConversationIdsWithAtLeastOneMessage(
  conversationIds: string[]
): Promise<MessagePresenceResult> {
  if (conversationIds.length === 0) {
    return { ok: true, conversationIds: new Set() };
  }

  const withMessage = new Set<string>();

  for (let i = 0; i < conversationIds.length; i += CONV_ID_BATCH) {
    const batch = conversationIds.slice(i, i + CONV_ID_BATCH);
    /** Conversations dont on n’a pas encore vu de ligne messages ; early-exit dès que le lot est couvert. */
    const remaining = new Set(batch);
    let from = 0;

    while (remaining.size > 0) {
      const remainingBefore = new Set(remaining);

      const builder = supabase
        .from('messages')
        .select('conversation_id')
        .in('conversation_id', [...remaining])
        .order('conversation_id', { ascending: true })
        .order('id', { ascending: true });

      const { data: rows, error } = await builder.range(from, from + MESSAGE_PRESENCE_ROW_PAGE - 1);

      if (error) {
        return { ok: false, errorMessage: error.message };
      }

      const chunk = rows ?? [];
      if (chunk.length === 0) {
        /** Fin de fenêtre pour ce `.in(remaining)` : plus aucune ligne, les id restants n’ont pas de message. */
        break;
      }
      for (const r of chunk) {
        const cid = (r as { conversation_id: string }).conversation_id;
        withMessage.add(cid);
        remaining.delete(cid);
      }

      if (remaining.size === 0) break;

      const filterChanged =
        remainingBefore.size !== remaining.size ||
        [...remainingBefore].some((id) => !remaining.has(id));

      if (filterChanged) {
        from = 0;
        continue;
      }

      if (chunk.length < MESSAGE_PRESENCE_ROW_PAGE) {
        break;
      }

      from += MESSAGE_PRESENCE_ROW_PAGE;
    }
  }

  return { ok: true, conversationIds: withMessage };
}
