/**
 * Google Sign-In (OAuth) – chargé à la demande pour éviter d'importer
 * expo-auth-session au démarrage (module natif ExpoCryptoAES absent sous Expo Go).
 * Utiliser via import dynamique depuis l'écran de login.
 */

import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import { supabase } from '@/lib/supabase';
import type { AuthError } from '@supabase/supabase-js';
import type { SignInResult } from './signInOut';

function parseTokensFromRedirectUrl(url: string): {
  access_token: string;
  refresh_token: string;
} | null {
  try {
    const parsed = new URL(url);
    const hash = parsed.hash?.slice(1);
    if (!hash) return null;
    const params = new URLSearchParams(hash);
    const access_token = params.get('access_token');
    const refresh_token = params.get('refresh_token');
    if (!access_token || !refresh_token) return null;
    return { access_token, refresh_token };
  } catch {
    return null;
  }
}

/**
 * Sign in with Google (OAuth). Nécessite un build de développement (expo run:ios / run:android)
 * ou EAS Build — pas disponible dans Expo Go (module natif requis).
 */
export async function signInWithGoogle(): Promise<SignInResult> {
  const redirectTo = makeRedirectUri();

  const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      skipBrowserRedirect: true,
    },
  });

  if (oauthError) {
    return { ok: false, error: oauthError };
  }

  const authUrl = data?.url;
  if (!authUrl) {
    return {
      ok: false,
      error: { message: 'No auth URL returned', name: 'AuthError', status: 500 } as AuthError,
    };
  }

  const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectTo);

  if (result.type !== 'success' || !result.url) {
    return {
      ok: false,
      error: {
        message: result.type === 'cancel' ? 'Connexion annulée' : 'Connexion Google échouée',
        name: 'AuthError',
        status: 400,
      } as AuthError,
    };
  }

  const tokens = parseTokensFromRedirectUrl(result.url);
  if (!tokens) {
    return {
      ok: false,
      error: {
        message: 'Réponse de connexion invalide',
        name: 'AuthError',
        status: 400,
      } as AuthError,
    };
  }

  const { error: sessionError } = await supabase.auth.setSession({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
  });

  if (sessionError) {
    return { ok: false, error: sessionError };
  }

  return { ok: true, error: null };
}
