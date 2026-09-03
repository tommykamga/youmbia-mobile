/**
 * Send a message in a conversation.
 */

import { supabase } from '@/lib/supabase';
import { trackMessageSendFailed, trackMessageSent } from '@/lib/analytics';
import type { Message } from './types';

export type SendMessageResult =
  | { data: Message; error: null }
  | { data: null; error: { message: string } };

export async function sendMessage(
  conversationId: string,
  body: string
): Promise<SendMessageResult> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { data: null, error: { message: 'Non connecté' } };
  }

  const trimmed = body.trim();
  if (!trimmed) {
    return { data: null, error: { message: 'Message vide' } };
  }

  const { data, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_id: user.id,
      body: trimmed,
    } as never)
    .select('id, conversation_id, sender_id, body, created_at, read_at')
    .single();

  if (error) {
    trackMessageSendFailed({ conversation_id: conversationId, error: error.message });
    return { data: null, error: { message: error.message } };
  }

  const row = data as {
    id: string;
    conversation_id: string;
    sender_id: string;
    body: string;
    created_at: string;
    read_at: string | null;
  };

  const message: Message = {
    id: row.id,
    conversation_id: row.conversation_id,
    sender_id: row.sender_id,
    body: row.body,
    created_at: row.created_at,
    read_at: row.read_at,
  };

  await supabase
    .from('conversations')
    .update({ updated_at: new Date().toISOString() } as never)
    .eq('id', conversationId);

  // Notification push au destinataire (best-effort, fire-and-forget).
  // Ne bloque jamais l'envoi : si l'Edge Function échoue, on log en dev uniquement
  // et le message reste considéré comme envoyé.
  void supabase.functions
    .invoke('send-message-push', { body: { message_id: message.id } })
    .then(({ error }) => {
      if (error && typeof __DEV__ !== 'undefined' && __DEV__) {
        console.warn('[sendMessage] send-message-push failed:', error.message);
      }
    })
    .catch((err) => {
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.warn('[sendMessage] send-message-push exception:', err);
      }
    });

  let messageCount = 1;
  try {
    const { count } = await supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', conversationId);
    if (typeof count === 'number') messageCount = count;
  } catch {
    // Analytics must never fail the send path.
  }

  trackMessageSent({
    conversation_id: conversationId,
    message_count: messageCount,
    message_type: 'text',
  });

  return { data: message, error: null };
}
