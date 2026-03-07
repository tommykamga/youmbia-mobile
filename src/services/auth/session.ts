/**
 * Auth session helpers for mobile.
 * Use for initial session restore and auth state subscription.
 */

import { supabase } from '@/lib/supabase';
import type { Session } from '@supabase/supabase-js';

/**
 * Returns the current session from storage (no network call).
 * Use on app init to restore UI state quickly.
 */
export async function getSession(): Promise<Session | null> {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) {
    if (__DEV__) {
      console.warn('[auth/session] getSession error:', error.message);
    }
    return null;
  }

  return session;
}

/**
 * Subscribe to auth state changes (sign in, sign out, token refresh).
 * Call the callback with (event, session). session is null on SIGNED_OUT.
 * Returns the unsubscribe function.
 */
export function onAuthStateChange(
  callback: (event: string, session: Session | null) => void
): () => void {
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((event, session) => {
    callback(event, session);
  });

  return () => subscription.unsubscribe();
}
