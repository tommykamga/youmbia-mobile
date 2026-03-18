import { useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { getUnreadMessagesCount } from '@/services/conversations';
import { getSession } from '@/services/auth';

// Short-circuit if Supabase is not configured: avoids pointless network calls
// and errors propagating into the tab layout when env vars are missing.
const isSupabaseConfigured =
  !!process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() &&
  !!process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();

/**
 * Hook to fetch the total unread messages count for the current user.
 * Refreshes every time the tab layout comes into focus.
 * Always returns a number (0 as fallback) – never throws.
 */
export function useUnreadMessagesCount() {
  const [unreadCount, setUnreadCount] = useState<number>(0);

  const fetchCount = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    try {
      const session = await getSession();
      const userId = session?.user?.id;

      if (!userId) {
        setUnreadCount(0);
        return;
      }

      const { count, error } = await getUnreadMessagesCount(userId);
      if (error) {
        setUnreadCount(0);
        return;
      }

      setUnreadCount(count ?? 0);
    } catch {
      // Never propagate: this hook runs in the tab layout and a throw here
      // would crash all tabs simultaneously.
      setUnreadCount(0);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void fetchCount();
    }, [fetchCount])
  );

  return unreadCount;
}
