/**
 * Routes Expo Router vers l’Auth Gate contextuel (mobile).
 * `redirect` / `contact` sont optionnels ; la gate valide `redirect` avec getSafeRedirect.
 */

import type { Href } from 'expo-router';
import type { AuthGateContextId } from '@/config/authGateContext';

/** Paramètres d’intention pour la gate (même idée que login ?redirect=&contact=). */
export type AuthGateNavigationIntent = {
  redirect?: string;
  contact?: string;
};

/**
 * @param context — identifiant UX (titres, successHref par défaut)
 * @param intent — optionnel : surcharge de la destination post-auth (`redirect`) et/ou `contact`
 */
export function buildAuthGateHref(
  context: AuthGateContextId,
  intent?: AuthGateNavigationIntent
): Href {
  const q = new URLSearchParams();
  q.set('context', context);
  if (intent?.redirect?.trim()) {
    q.set('redirect', intent.redirect.trim());
  }
  if (intent?.contact?.trim()) {
    q.set('contact', intent.contact.trim());
  }
  return `/(auth)/gate?${q.toString()}` as Href;
}
