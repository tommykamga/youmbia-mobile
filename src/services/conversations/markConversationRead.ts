/**
 * Mark all messages in a conversation as read (for the current user: messages not sent by me).
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

  const now = new Date().toISOString();

  const { error } = await supabase
    .from('messages')
    .update({ read_at: now } as never)
    .eq('conversation_id', conversationId)
    .neq('sender_id', user.id)
    .is('read_at', null);

  if (error) return { data: null, error: { message: error.message } };
  return { data: null, error: null };
}
