/**
 * Point d’entrée unique pour Sign in with Apple (import dynamique).
 * Utilisé par login, gate et signup — même comportement, pas de second écran.
 * Symétrique à googleSignInMobile pour rester cohérent.
 */

import type { SignInResult } from '@/services/auth/signInOut';
import { mapAuthErrorMessage } from '@/lib/mapAuthErrorMessage';

export async function runAppleOAuth(): Promise<SignInResult> {
  const { signInWithApple } = await import('@/services/auth/signInWithApple');
  return signInWithApple();
}

/**
 * Message utilisateur après échec (`ok: false`) ou exception (import / module natif).
 */
export function formatAppleSignInUserMessage(error: unknown, result?: SignInResult): string {
  if (result && !result.ok && result.error) {
    return mapAuthErrorMessage({
      message: result.error.message || 'Connexion Apple échouée.',
    });
  }
  const msg = error instanceof Error ? error.message : String(error ?? '');
  return msg || 'Connexion Apple échouée.';
}
