/**
 * Nombre de conversations ayant au moins un message non lu reçu (pas les messages envoyés).
 * COUNT(DISTINCT conversation_id) via déduplication côté client sur une requête légère.
 */

import { supabase } from '@/lib/supabase';
import { conversationsVisibleForUserOrFilter } from '@/lib/conversationVisibility';

export type GetUnreadConversationsCountResult =
  | { count: number; conversationIds: string[]; error: null }
  | { count: number; conversationIds: string[]; error: { message: string } };

const CONVERSATION_ID_BATCH = 200;

export async function getUnreadConversationsCount(
  userId: string
): Promise<GetUnreadConversationsCountResult> {
  try {
    const { data: convRows, error: convError } = await supabase
      .from('conversations')
      .select('id')
      .or(conversationsVisibleForUserOrFilter(userId));

    if (convError) {
      return { count: 0, conversationIds: [], error: { message: convError.message } };
    }

    const convIds = (convRows ?? []).map((r) => (r as { id: string }).id);
    if (convIds.length === 0) {
      return { count: 0, conversationIds: [], error: null };
    }

    const unreadConversationIds = new Set<string>();

    for (let i = 0; i < convIds.length; i += CONVERSATION_ID_BATCH) {
      const batch = convIds.slice(i, i + CONVERSATION_ID_BATCH);
      const { data: unreadRows, error: unreadError } = await supabase
        .from('messages')
        .select('conversation_id')
        .in('conversation_id', batch)
        .neq('sender_id', userId)
        .is('read_at', null);

      if (unreadError) {
        return { count: 0, conversationIds: [], error: { message: unreadError.message } };
      }

      for (const row of unreadRows ?? []) {
        unreadConversationIds.add((row as { conversation_id: string }).conversation_id);
      }
    }

    const conversationIds = [...unreadConversationIds];
    return { count: conversationIds.length, conversationIds, error: null };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Erreur inconnue';
    return { count: 0, conversationIds: [], error: { message } };
  }
}
