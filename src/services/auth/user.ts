/**
 * Current user retrieval for mobile.
 * Uses getUser() for a validated server-side check when needed.
 */

import { supabase } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';

/**
 * Returns the current user from the session.
 * For a quick local check, use getSession() and session?.user.
 * This calls the server to validate the JWT (use when you need to ensure the user is still valid).
 */
export async function getCurrentUser(): Promise<User | null> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    if (__DEV__) {
      console.warn('[auth/user] getCurrentUser error:', error.message);
    }
    return null;
  }

  return user;
}
