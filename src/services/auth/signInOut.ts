/**
 * Sign in / sign out / sign up – no UI; call from auth screens.
 */

import { supabase } from '@/lib/supabase';
import type { AuthError } from '@supabase/supabase-js';

export type SignInResult =
  | { ok: true; error: null }
  | { ok: false; error: AuthError };

export type SignUpResult =
  | { ok: true; error: null }
  | { ok: false; error: AuthError };

/**
 * Sign in with email and password.
 * Session is persisted via the Supabase client storage (expo-sqlite localStorage).
 */
export async function signIn(
  email: string,
  password: string
): Promise<SignInResult> {
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  if (error) {
    return { ok: false, error };
  }

  return { ok: true, error: null };
}

/**
 * Sign up with email and password.
 * On success, session is set and persisted; user is signed in.
 */
export async function signUp(
  email: string,
  password: string
): Promise<SignUpResult> {
  const { error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
  });

  if (error) {
    return { ok: false, error };
  }

  return { ok: true, error: null };
}

/**
 * Sign out the current user and clear the persisted session.
 */
export async function signOut(): Promise<{ error: AuthError | null }> {
  const { error } = await supabase.auth.signOut();
  return { error: error ?? null };
}
