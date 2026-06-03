import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { getSession } from '@/services/auth';
import { getUnreadConversationsCount } from '@/services/conversations/getUnreadConversationsCount';
import {
  emitConversationRead,
  getOpenConversationId,
  subscribeMessagingEvents,
} from '@/lib/messagingRealtime';
import { supabaseRuntime } from '@/lib/supabase';

const UNREAD_REFRESH_MIN_INTERVAL_MS = 5_000;

/**
 * Badge onglet Messages : nombre de conversations non lues (pas de messages).
 * Mise à jour via Realtime + marquage lu optimiste + refetch léger au focus.
 */
export function useUnreadConversationsCount() {
  const [count, setCount] = useState(0);
  const unreadIdsRef = useRef<Set<string>>(new Set());
  const userIdRef = useRef<string | null>(null);
  const lastFetchAtRef = useRef(0);
  const fetchInFlightRef = useRef(false);

  const applySnapshot = useCallback((ids: string[]) => {
    unreadIdsRef.current = new Set(ids);
    setCount(ids.length);
  }, []);

  const refreshFromServer = useCallback(async (force = false) => {
    if (!supabaseRuntime.isConfigured) return;
    const now = Date.now();
    if (
      !force &&
      lastFetchAtRef.current > 0 &&
      now - lastFetchAtRef.current < UNREAD_REFRESH_MIN_INTERVAL_MS
    ) {
      return;
    }
    if (fetchInFlightRef.current) return;
    fetchInFlightRef.current = true;
    try {
      const session = await getSession();
      const userId = session?.user?.id;
      userIdRef.current = userId ?? null;
      if (!userId) {
        unreadIdsRef.current = new Set();
        setCount(0);
        return;
      }
      const result = await getUnreadConversationsCount(userId);
      lastFetchAtRef.current = Date.now();
      if (!result.error) {
        applySnapshot(result.conversationIds);
      }
    } catch {
      unreadIdsRef.current = new Set();
      setCount(0);
    } finally {
      fetchInFlightRef.current = false;
    }
  }, [applySnapshot]);

  const markConversationReadLocal = useCallback((conversationId: string) => {
    const ids = unreadIdsRef.current;
    if (!ids.has(conversationId)) return;
    ids.delete(conversationId);
    setCount(ids.size);
    emitConversationRead(conversationId);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refreshFromServer();
    }, [refreshFromServer])
  );

  useEffect(() => {
    return subscribeMessagingEvents((event) => {
      const userId = userIdRef.current;
      if (!userId) return;

      if (event.type === 'conversation_read') {
        const ids = unreadIdsRef.current;
        if (ids.delete(event.conversationId)) {
          setCount(ids.size);
        }
        return;
      }

      if (event.type === 'message_inserted') {
        const { message } = event;
        if (message.sender_id === userId) return;
        if (message.conversation_id === getOpenConversationId()) return;
        const ids = unreadIdsRef.current;
        if (ids.has(message.conversation_id)) return;
        ids.add(message.conversation_id);
        setCount(ids.size);
        return;
      }

      if (event.type === 'message_updated') {
        if (event.message.read_at && event.message.sender_id !== userId) {
          void refreshFromServer(true);
        }
      }
    });
  }, [refreshFromServer]);

  return { count, refreshFromServer, markConversationReadLocal };
}
