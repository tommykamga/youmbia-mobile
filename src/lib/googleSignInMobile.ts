/**
 * Point d’entrée unique pour Google OAuth mobile (import dynamique, pas d’ExpoCrypto au cold start).
 * Utilisé par login, gate et signup — même comportement, pas de second écran.
 */

import type { SignInResult } from '@/services/auth/signInOut';
import { mapAuthErrorMessage } from '@/lib/mapAuthErrorMessage';

export async function runGoogleOAuth(): Promise<SignInResult> {
  const { signInWithGoogle } = await import('@/services/auth/signInWithGoogle');
  return signInWithGoogle();
}

/**
 * Message utilisateur après échec OAuth (`ok: false`) ou exception (import / module natif).
 */
export function formatGoogleSignInUserMessage(error: unknown, result?: SignInResult): string {
  if (result && !result.ok && result.error) {
    return mapAuthErrorMessage({
      message: result.error.message || 'Connexion Google échouée.',
    });
  }
  const msg = error instanceof Error ? error.message : String(error ?? '');
  if (msg.includes('ExpoCryptoAES') || msg.includes('native module')) {
    return 'Google Auth nécessite un build natif sécurisé (indisponible via Expo Go seul).';
  }
  return msg || 'Connexion Google échouée.';
}
