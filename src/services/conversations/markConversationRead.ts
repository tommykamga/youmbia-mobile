/**
 * Mark all messages in a conversation as read (for the current user: messages not sent by me).
 * Also resets the correct unread counter (buyer vs seller) in the conversations table.
 */

import { supabase } from '@/lib/supabase';

export type MarkConversationReadResult =
  | { data: null; error: null }
  | { data: null; error: { message: string } };

export async function markConversationRead(conversationId: string): Promise<MarkConversationReadResult> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { data: null, error: { message: 'Non connecté' } };
  }

  // 1. Mark received messages as read via the secured RPC (SECURITY DEFINER).
  //    La RPC ne modifie que read_at, uniquement sur les messages reçus non lus,
  //    et uniquement si l'appelant est participant — aucune policy UPDATE directe.
  const { error: rpcError } = await supabase.rpc('mark_conversation_read', {
    p_conversation_id: conversationId,
  });

  if (rpcError) {
    if (__DEV__) console.warn('[markConversationRead] RPC mark_conversation_read failed:', rpcError.message);
    return { data: null, error: { message: rpcError.message } };
  }

  // 2. Reset conversation unread counter based on user role
  try {
    const { data: conv } = await supabase
      .from('conversations')
      .select('buyer_id, seller_id')
      .eq('id', conversationId)
      .single();

    if (conv) {
      const updateData: any = {};
      if (conv.buyer_id === user.id) {
        updateData.buyer_unread_count = 0;
      } else if (conv.seller_id === user.id) {
        updateData.seller_unread_count = 0;
      }

      if (Object.keys(updateData).length > 0) {
        await supabase
          .from('conversations')
          .update(updateData)
          .eq('id', conversationId);
      }
    }
  } catch (err) {
    console.warn('[markConversationRead] Failed to reset conversation unread count:', err);
  }

  return { data: null, error: null };
}
