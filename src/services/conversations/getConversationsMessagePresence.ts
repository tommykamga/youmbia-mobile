/**
 * Détermine quelles conversations ont au moins une ligne `messages` (preuve serveur),
 * sans déduire d'un aperçu ou compteur. Pagination bornée par lot pour éviter N+1 et silences.
 */

import { supabase } from '@/lib/supabase';

const CONV_ID_BATCH = 200;
/** Lignes max par requête PostgREST (évite résultats tronqués silencieux). */
const ROW_PAGE = 1000;

export type MessagePresenceResult =
  | { ok: true; conversationIds: Set<string> }
  | { ok: false; errorMessage: string };

/**
 * Pour chaque id donné, vérifie qu'au moins un message existe (requêtes paginées par lot).
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
      const { data: rows, error } = await supabase
        .from('messages')
        .select('conversation_id')
        .in('conversation_id', [...remaining])
        .range(from, from + ROW_PAGE - 1);

      if (error) {
        return { ok: false, errorMessage: error.message };
      }

      const chunk = rows ?? [];
      if (chunk.length === 0) {
        break;
      }
      for (const r of chunk) {
        const cid = (r as { conversation_id: string }).conversation_id;
        withMessage.add(cid);
        remaining.delete(cid);
      }

      if (chunk.length < ROW_PAGE) break;
      from += ROW_PAGE;
    }
  }

  return { ok: true, conversationIds: withMessage };
}
