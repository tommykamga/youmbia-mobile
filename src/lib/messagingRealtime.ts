/**
 * Bus léger + canal Realtime unique pour la messagerie (INSERT/UPDATE sur public.messages).
 * Un seul abonnement actif par utilisateur connecté ; nettoyage au logout.
 */

import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { Message } from '@/services/conversations/types';

export type MessagingRealtimeEvent =
  | { type: 'message_inserted'; message: Message }
  | { type: 'message_updated'; message: Message }
  | { type: 'conversation_read'; conversationId: string };

type MessagingListener = (event: MessagingRealtimeEvent) => void;

const listeners = new Set<MessagingListener>();

let activeChannel: RealtimeChannel | null = null;
let activeUserId: string | null = null;

/** Conversation actuellement ouverte (fil) — badge non incrémenté si message entrant ici. */
let openConversationId: string | null = null;

export function setOpenConversationId(conversationId: string | null): void {
  openConversationId = conversationId;
}

export function getOpenConversationId(): string | null {
  return openConversationId;
}

export function subscribeMessagingEvents(listener: MessagingListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitMessagingEvent(event: MessagingRealtimeEvent): void {
  listeners.forEach((listener) => {
    try {
      listener(event);
    } catch {
      // Ne jamais casser le canal Realtime à cause d'un listener UI.
    }
  });
}

export function emitConversationRead(conversationId: string): void {
  emitMessagingEvent({ type: 'conversation_read', conversationId });
}

function parseMessageRow(row: unknown): Message | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  if (
    typeof r.id !== 'string' ||
    typeof r.conversation_id !== 'string' ||
    typeof r.sender_id !== 'string' ||
    typeof r.body !== 'string' ||
    typeof r.created_at !== 'string'
  ) {
    return null;
  }
  return {
    id: r.id,
    conversation_id: r.conversation_id,
    sender_id: r.sender_id,
    body: r.body,
    created_at: r.created_at,
    read_at: typeof r.read_at === 'string' ? r.read_at : r.read_at === null ? null : null,
  };
}

/** Évite doublons fil (optimiste + API + Realtime). */
export function appendMessageDeduped(prev: Message[], incoming: Message): Message[] {
  if (prev.some((m) => m.id === incoming.id)) return prev;
  return [...prev, incoming];
}

export function startMessagingRealtime(userId: string): void {
  if (!userId) return;
  if (activeChannel && activeUserId === userId) return;

  stopMessagingRealtime();
  activeUserId = userId;

  const channel = supabase
    .channel(`messages:inbox:${userId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages' },
      (payload) => {
        const message = parseMessageRow(payload.new);
        if (!message) return;
        emitMessagingEvent({ type: 'message_inserted', message });
      }
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'messages' },
      (payload) => {
        const message = parseMessageRow(payload.new);
        if (!message) return;
        emitMessagingEvent({ type: 'message_updated', message });
      }
    )
    .subscribe((status) => {
      if (__DEV__ && status === 'CHANNEL_ERROR') {
        console.warn('[messagingRealtime] channel error — vérifier publication supabase_realtime sur messages');
      }
    });

  activeChannel = channel;
}

export function stopMessagingRealtime(): void {
  if (activeChannel) {
    void supabase.removeChannel(activeChannel);
    activeChannel = null;
  }
  activeUserId = null;
  openConversationId = null;
}

export function isMessagingRealtimeActive(): boolean {
  return activeChannel !== null;
}
