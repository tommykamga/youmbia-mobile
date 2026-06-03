/**
 * Démarre le canal Realtime messagerie unique pour la session connectée.
 * À monter une seule fois (ex. layout des tabs).
 */

import { useEffect } from 'react';
import { onAuthStateChange, getSession } from '@/services/auth';
import { startMessagingRealtime, stopMessagingRealtime } from '@/lib/messagingRealtime';
import { supabaseRuntime } from '@/lib/supabase';

export function useMessagingRealtime(): void {
  useEffect(() => {
    if (!supabaseRuntime.isConfigured) return;

    let cancelled = false;

    const bindUser = async () => {
      const session = await getSession();
      if (cancelled) return;
      const userId = session?.user?.id;
      if (userId) {
        startMessagingRealtime(userId);
      } else {
        stopMessagingRealtime();
      }
    };

    void bindUser();

    const unsubscribe = onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        stopMessagingRealtime();
        return;
      }
      const userId = session?.user?.id;
      if (userId && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
        startMessagingRealtime(userId);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
      stopMessagingRealtime();
    };
  }, []);
}
