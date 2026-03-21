/**
 * Sign in / sign out / sign up – no UI; call from auth screens.
 */

import { supabase } from '@/lib/supabase';
import type { AuthError } from '@supabase/supabase-js';

export type SignInResult =
  | { ok: true; error: null }
  | { ok: false; error: { message: string } };

export type SignUpResult =
  | { ok: true; error: null; requiresEmailConfirmation: false }
  | { ok: true; error: null; requiresEmailConfirmation: true }
  | { ok: false; error: { message: string }; requiresEmailConfirmation: false };

function getSafeAuthErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  const msg = raw.toLowerCase();
  if (msg.includes('network') || msg.includes('fetch') || msg.includes('internet')) {
    return 'Réseau indisponible. Réessayez.';
  }
  return raw || 'Une erreur est survenue. Réessayez.';
}

/**
 * Sign in with email and password.
 * Session is persisted via the Supabase client storage (expo-sqlite localStorage).
 */
export async function signIn(
  email: string,
  password: string
): Promise<SignInResult> {
  try {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      return { ok: false, error: { message: getSafeAuthErrorMessage(error) } };
    }

    return { ok: true, error: null };
  } catch (error) {
    return { ok: false, error: { message: getSafeAuthErrorMessage(error) } };
  }
}

/**
 * Sign up with email and password.
 * On success, session is set and persisted; user is signed in.
 */
export async function signUp(
  email: string,
  password: string
): Promise<SignUpResult> {
  try {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });

    if (error) {
      return {
        ok: false,
        error: { message: getSafeAuthErrorMessage(error) },
        requiresEmailConfirmation: false,
      };
    }

    if (data.user && !data.session) {
      return { ok: true, error: null, requiresEmailConfirmation: true };
    }

    return { ok: true, error: null, requiresEmailConfirmation: false };
  } catch (error) {
    return {
      ok: false,
      error: { message: getSafeAuthErrorMessage(error) },
      requiresEmailConfirmation: false,
    };
  }
}

/**
 * Sign out the current user and clear the persisted session.
 */
export async function signOut(): Promise<{ error: AuthError | null }> {
  const { error } = await supabase.auth.signOut();
  return { error: error ?? null };
}

/**
 * Sign in with Magic Link (OTP).
 */
export async function signInWithOtp(email: string, redirectTo?: string): Promise<SignInResult> {
  try {
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirectTo },
    });
    if (error) {
      return { ok: false, error: { message: getSafeAuthErrorMessage(error) } };
    }
    return { ok: true, error: null };
  } catch (error) {
    return { ok: false, error: { message: getSafeAuthErrorMessage(error) } };
  }
}

/**
 * Reset password instruction email.
 */
export async function resetPasswordForEmail(email: string, redirectTo?: string): Promise<SignInResult> {
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo,
    });
    if (error) {
      return { ok: false, error: { message: getSafeAuthErrorMessage(error) } };
    }
    return { ok: true, error: null };
  } catch (error) {
    return { ok: false, error: { message: getSafeAuthErrorMessage(error) } };
  }
}
