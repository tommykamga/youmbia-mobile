/**
 * Sign in with Apple (natif iOS) — exigé par Apple lorsque d'autres connexions
 * sociales tierces (Google) sont proposées (App Store Review Guideline 4.8).
 *
 * Flux : expo-apple-authentication renvoie un `identityToken` (JWT signé Apple)
 * que l'on échange contre une session Supabase via `signInWithIdToken`.
 * Chargé à la demande (import dynamique) pour éviter de toucher le module natif
 * au cold start sur les plateformes non‑iOS.
 */

import { captureAuthSuccess } from '@/lib/analytics';
import { supabase } from '@/lib/supabase';
import type { SignInResult } from './signInOut';

export async function signInWithApple(): Promise<SignInResult> {
  try {
    const AppleAuthentication = await import('expo-apple-authentication');

    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });

    if (!credential.identityToken) {
      return {
        ok: false,
        error: { message: 'Connexion Apple échouée : jeton d’identité manquant.' },
      };
    }

    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
    });

    if (error) {
      return { ok: false, error: { message: error.message } };
    }

    // Apple ne fournit le nom qu'au tout premier consentement : on le persiste
    // dans les métadonnées utilisateur si disponible (best-effort, non bloquant).
    const fullName = credential.fullName;
    const composedName = [fullName?.givenName, fullName?.familyName]
      .filter(Boolean)
      .join(' ')
      .trim();
    if (composedName) {
      try {
        await supabase.auth.updateUser({ data: { full_name: composedName } });
      } catch {
        // non bloquant
      }
    }

    const { data: userData } = await supabase.auth.getUser();
    if (userData.user) {
      void captureAuthSuccess(userData.user, { method: 'apple' });
    }

    return { ok: true, error: null };
  } catch (e) {
    const code = (e as { code?: string } | null)?.code;
    if (code === 'ERR_REQUEST_CANCELED' || code === 'ERR_CANCELED') {
      return { ok: false, error: { message: 'Connexion annulée' } };
    }
    const message = e instanceof Error ? e.message : 'Connexion Apple échouée';
    return { ok: false, error: { message } };
  }
}
