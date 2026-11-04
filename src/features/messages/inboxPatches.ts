import type { Conversation, Message } from '@/services/conversations/types';

export function sortConversationsInbox(data: Conversation[]): void {
  data.sort((a, b) => {
    const dA = new Date(a.last_message_at || a.created_at).getTime();
    const dB = new Date(b.last_message_at || b.created_at).getTime();
    return dB - dA;
  });
}

export function patchInboxOnIncoming(
  conversations: Conversation[],
  message: Message,
  userId: string
): Conversation[] | 'refetch' {
  const idx = conversations.findIndex((c) => c.id === message.conversation_id);
  if (idx < 0) return 'refetch';
  const isFromOther = message.sender_id !== userId;
  const preview =
    message.body.length > 60 ? `${message.body.slice(0, 60)}…` : message.body;
  const next = [...conversations];
  const conv = { ...next[idx] };
  conv.last_message_at = message.created_at;
  conv.last_message_preview = preview;
  if (isFromOther) {
    conv.unread_count = (conv.unread_count ?? 0) + 1;
  }
  next[idx] = conv;
  sortConversationsInbox(next);
  return next;
}

export function patchInboxOnRead(conversations: Conversation[], conversationId: string): Conversation[] {
  return conversations.map((c) =>
    c.id === conversationId ? { ...c, unread_count: 0 } : c
  );
}
