/**
 * Démarre le canal Realtime profil (avatar) pour la session connectée.
 * À monter une seule fois (ex. layout des tabs).
 */

import { useEffect } from 'react';
import { onAuthStateChange, getSession } from '@/services/auth';
import { startProfileRealtime, stopProfileRealtime } from '@/lib/profileRealtime';
import { supabaseRuntime } from '@/lib/supabase';

export function useProfileRealtime(): void {
  useEffect(() => {
    if (!supabaseRuntime.isConfigured) return;

    let cancelled = false;

    const bindUser = async () => {
      const session = await getSession();
      if (cancelled) return;
      const userId = session?.user?.id;
      if (userId) {
        startProfileRealtime(userId);
      } else {
        stopProfileRealtime();
      }
    };

    void bindUser();

    const unsubscribe = onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        stopProfileRealtime();
        return;
      }
      const userId = session?.user?.id;
      if (userId && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
        startProfileRealtime(userId);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
      stopProfileRealtime();
    };
  }, []);
}
