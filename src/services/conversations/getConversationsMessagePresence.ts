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
    let from = 0;

    for (;;) {
      const { data: rows, error } = await supabase
        .from('messages')
        .select('conversation_id')
        .in('conversation_id', batch)
        .range(from, from + ROW_PAGE - 1);

      if (error) {
        return { ok: false, errorMessage: error.message };
      }

      const chunk = rows ?? [];
      for (const r of chunk) {
        withMessage.add((r as { conversation_id: string }).conversation_id);
      }

      if (chunk.length < ROW_PAGE) break;
      from += ROW_PAGE;
    }
  }

  return { ok: true, conversationIds: withMessage };
}
