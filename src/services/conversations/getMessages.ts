/**
 * Fetch messages for a conversation, ordered by created_at asc.
 */

import { supabase } from '@/lib/supabase';
import type { Message } from './types';

export type GetMessagesResult =
  | { data: Message[]; error: null }
  | { data: null; error: { message: string } };

export async function getMessages(conversationId: string): Promise<GetMessagesResult> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { data: null, error: { message: 'Non connecté' } };
  }

  const { data, error } = await supabase
    .from('messages')
    .select('id, conversation_id, sender_id, body, created_at, read_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (error) return { data: null, error: { message: error.message } };

  const list = (data ?? []) as {
    id: string;
    conversation_id: string;
    sender_id: string;
    body: string;
    created_at: string;
    read_at: string | null;
  }[];

  const messages: Message[] = list.map((row) => ({
    id: row.id,
    conversation_id: row.conversation_id,
    sender_id: row.sender_id,
    body: row.body,
    created_at: row.created_at,
    read_at: row.read_at,
  }));

  return { data: messages, error: null };
}
